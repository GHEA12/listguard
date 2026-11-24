// A minimal Telegraph client speaking the node's documented escrow flow:
//
//   POST {node}/engine/v1/ask  -> 402 with payment options
//   pick the "escrow" option (Ethereum Sepolia), personal_sign its challenge
//   message, resend with an X-PAYMENT envelope header. The ask is charged to
//   the caller's escrow balance in the epoch ledger; a failed ask is never
//   billed. (The x402 "exact" rail is currently down — bounties issue #214 —
//   so escrow is the working rail, and the one the node offers on every 402.)
//
// Free reads used for evidence: /engine/v1/intents[/{id}], /api/miners,
// /leaderboard/miners, /engine/v1/signal/{hash}, /v1/ledger/account/{addr}.

import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "./config.js";

export class SpendCapError extends Error {}

export class TelegraphClient {
  constructor(cfg = config) {
    this.cfg = cfg;
    this.account = cfg.privateKey ? privateKeyToAccount(cfg.privateKey) : null;
    mkdirSync(cfg.ledgerDir, { recursive: true });
    this.ledgerPath = join(cfg.ledgerDir, "ledger.jsonl");
  }

  get address() {
    return this.account?.address;
  }

  // ---- free reads -------------------------------------------------------

  async getJson(path) {
    const res = await fetch(this.cfg.nodeUrl + path, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return res.json();
  }

  intents() {
    return this.getJson("/engine/v1/intents");
  }

  intent(id) {
    return this.getJson(`/engine/v1/intents/${encodeURIComponent(id)}`);
  }

  ranking(intent, limit = 5) {
    return this.getJson(`/leaderboard/miners?intent=${encodeURIComponent(intent)}&limit=${limit}`);
  }

  ledgerAccount(address = this.address) {
    return this.getJson(`/v1/ledger/account/${address}`);
  }

  verifySignal(hash) {
    return this.getJson(`/engine/v1/signal/${hash}`);
  }

  // ---- spend accounting ---------------------------------------------------

  spentTodayUusdc() {
    if (!existsSync(this.ledgerPath)) return 0;
    const today = new Date().toISOString().slice(0, 10);
    let sum = 0;
    for (const line of readFileSync(this.ledgerPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (row.kind === "purchase" && String(row.ts).startsWith(today)) sum += Number(row.cost_uusdc || 0);
      } catch { /* ignore partial lines */ }
    }
    return sum;
  }

  recordPurchase(row) {
    appendFileSync(this.ledgerPath, JSON.stringify({ kind: "purchase", ts: new Date().toISOString(), ...row }) + "\n");
  }

  // ---- the paid ask -------------------------------------------------------

  /**
   * Ask the network. Give an intent (+params) or a plain query.
   * Returns { status, body, receipt, billedUusdc, signalHashes }.
   * Throws SpendCapError before signing if caps would be exceeded.
   */
  async ask({ intent, params, query, maxBudgetUusdc } = {}) {
    if (!this.account) throw new Error("TELEGRAPH_PRIVATE_KEY is not set: no wallet to pay from.");
    const body = {
      ...(query ? { query } : {}),
      ...(intent ? { intent } : {}),
      ...(params ? { params } : {}),
    };
    const budget = Math.min(maxBudgetUusdc ?? this.cfg.maxBudgetUusdc, Math.round(this.cfg.maxPerRunUsd * 1e6));
    if (budget >= 10000) body.max_budget_usdc = budget;

    const send = (headers = {}) =>
      fetch(this.cfg.nodeUrl + "/engine/v1/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.cfg.askTimeoutMs),
      });

    const first = await send();
    if (first.status !== 402) return this.#delivered(first, intent, 0);

    const challenge = await first.json().catch(() => ({}));
    const accepts = challenge.accepts || [];
    const escrow = accepts.find((a) => a.scheme === "escrow");
    if (!escrow) throw new Error("The node offered no escrow payment option on this ask.");

    const amountUusdc = amountOf(escrow);
    // Enforce caps BEFORE signing anything.
    const priceUsd = amountUusdc / 1e6;
    if (priceUsd > this.cfg.maxPerRunUsd) {
      throw new SpendCapError(`Ask priced at $${priceUsd} exceeds the per-run cap of $${this.cfg.maxPerRunUsd}. Nothing was signed.`);
    }
    const todayUsd = this.spentTodayUusdc() / 1e6;
    if (todayUsd + priceUsd > this.cfg.maxPerDayUsd) {
      throw new SpendCapError(`Daily spend $${todayUsd} + $${priceUsd} exceeds the daily cap of $${this.cfg.maxPerDayUsd}. Nothing was signed.`);
    }

    const header = await this.#escrowHeader(escrow);
    const res = await send({ "X-PAYMENT": header });
    return this.#delivered(res, intent, amountUusdc);
  }

  async #delivered(res, intent, heldUusdc) {
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    const receipt = receiptOf(res);
    if (res.status < 200 || res.status >= 300) {
      const reason = body?.reason || body?.error || `HTTP ${res.status}`;
      throw new Error(`Ask failed (${intent || "routed"}): ${reason}`);
    }
    const billedUusdc = billedOf(body, receipt, heldUusdc);
    const signalHashes = collectSignalHashes(body);
    this.recordPurchase({
      intent: intent || "(routed)",
      cost_uusdc: billedUusdc,
      signal_hashes: signalHashes,
      receipt: receipt ?? undefined,
    });
    return { status: res.status, body, receipt, billedUusdc, signalHashes };
  }

  // The escrow X-PAYMENT header: a personal_sign (EIP-191) of the challenge's
  // message template. It proves intent only; it cannot move funds.
  async #escrowHeader(req) {
    const template = String(req?.extra?.message || "");
    if (!template) throw new Error("The escrow challenge has no message to sign.");
    const now = Math.floor(Date.now() / 1000);
    const authorization = {
      from: this.account.address,
      to: req.payTo,
      value: String(amountOf(req)),
      validAfter: String(now - 10),
      validBefore: String(now + 60), // the node allows a window of 2 minutes at most
      nonce: "0x" + randomBytes(32).toString("hex"),
    };
    // The node rebuilds the message with the wallet lowercased.
    const message = template
      .replaceAll("{from}", authorization.from.toLowerCase())
      .replaceAll("{nonce}", authorization.nonce)
      .replaceAll("{validAfter}", authorization.validAfter)
      .replaceAll("{validBefore}", authorization.validBefore);
    const signature = await this.account.signMessage({ message });
    const envelope = { x402Version: 2, scheme: "escrow", network: req.network, payload: { signature, authorization } };
    return Buffer.from(JSON.stringify(envelope)).toString("base64");
  }
}

// Challenge amounts: prefer an explicit micro-USDC amount; the node's 402
// body also prints a dollar price ("$0.01") which maps 1:1 to μUSDC.
export function amountOf(accept) {
  if (accept?.amount !== undefined) return Number(accept.amount);
  if (typeof accept?.price === "string") {
    const m = accept.price.replace(/[$,]/g, "").match(/([0-9]*\.?[0-9]+)/);
    if (m) return Math.round(Number(m[1]) * 1e6);
  }
  if (accept?.extra?.message) {
    const m = String(accept.extra.message).match(/Amount:\s*([0-9]+)\s*uUSDC/i);
    if (m) return Number(m[1]);
  }
  return 0;
}

// What a delivered ask was billed: its fulfillment payment rows when present,
// else the receipt's single row; never above the held amount.
export function billedOf(body, receipt, heldUusdc) {
  const rows = body?.fulfillment?.payments;
  let uusdc;
  if (Array.isArray(rows) && rows.length) uusdc = rows.reduce((s, p) => s + Number(p?.amount_uusdc || 0), 0);
  else if (receipt?.amount_uusdc !== undefined) uusdc = Number(receipt.amount_uusdc);
  if (Number.isFinite(uusdc) && uusdc >= 0) return heldUusdc ? Math.min(uusdc, heldUusdc) : uusdc;
  return heldUusdc;
}

function receiptOf(res) {
  const header = res.headers.get("X-PAYMENT-RESPONSE") || res.headers.get("PAYMENT-RESPONSE") || res.headers.get("x-telegraph-receipt");
  if (!header) return undefined;
  try { return JSON.parse(Buffer.from(header, "base64").toString("utf8")); } catch { return header; }
}

// Pull every signal hash out of an ask response, wherever the node put it.
export function collectSignalHashes(value, out = [], depth = 0) {
  if (!value || depth > 6) return out;
  if (Array.isArray(value)) {
    for (const v of value) collectSignalHashes(v, out, depth + 1);
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (/signal_?hash/i.test(k) && typeof v === "string" && v.startsWith("0x") && !out.includes(v)) out.push(v);
      else collectSignalHashes(v, out, depth + 1);
    }
  }
  return out;
}
