// ListGuard: the autonomous listings desk (Mission 01 — Exchange).
//
// A listing application goes in. The desk autonomously buys six intelligence
// checks through Telegraph in parallel, verifies every returned signal on
// the node, scores each answer with the deterministic rules below, and
// returns a signed listing risk memo with a cost line.
//
// Safety posture: a check that errors is marked ERROR and forces MANUAL
// REVIEW — it never silently passes. A sanctions match is a hard REJECT.
// Spend caps are enforced inside the Telegraph client before any signature.

import { keccak256, toHex, recoverMessageAddress } from "viem";
import { TelegraphClient } from "./telegraph.js";
import { Chain } from "./chain.js";

export const INTENTS = {
  audit: "SMART_CONTRACT_AUDIT_GENERAL",
  holders: "TOKEN_HOLDER_COUNT_GENERAL",
  treasury: "ONCHAIN_METRIC_VERIFY_GENERAL",
  sanctions: "SANCTIONS_SCREENING_MATCH_GENERAL",
  social: "SOCIAL_BOT_DETECTION_GENERAL",
  code: "CODE_REVIEW_GENERAL",
};

export function validateApplication(app) {
  const problems = [];
  if (!app || typeof app !== "object") problems.push("application must be a JSON object");
  if (!app?.project) problems.push("project (name) is required");
  if (!app?.token?.address || !/^0x[0-9a-fA-F]{40}$/.test(app.token.address)) problems.push("token.address must be a 0x address");
  if (!Array.isArray(app?.entities) || app.entities.length === 0) problems.push("entities: at least one project/team entity name is required (sanctions screening)");
  if (!app?.social) problems.push("social (project social handle) is required");
  return problems;
}

// The answer's useful payload, wherever the node nested it.
export function answerOf(body) {
  if (!body || typeof body !== "object") return {};
  return body.answer && typeof body.answer === "object" ? body.answer
    : body.result && typeof body.result === "object" ? body.result
    : body;
}

const textOf = (v) => JSON.stringify(v ?? "").toLowerCase();

export const scorers = {
  audit(body) {
    const a = answerOf(body);
    const rating = String(a.risk_rating || a.overall_risk || a.rating || a.risk || "");
    const t = textOf(a);
    if (rating) {
      // A structured rating decides on its own; the free-text summary often
      // mentions severity words while negating them ("no critical findings").
      if (/critical|high/.test(rating.toLowerCase())) return { status: "fail", detail: `Audit risk rating: ${rating}.` };
      if (/medium|moderate/.test(rating.toLowerCase())) return { status: "warn", detail: `Audit risk rating: ${rating}.` };
      if (/low/.test(rating.toLowerCase())) return { status: "pass", detail: `Audit risk rating: ${rating}.` };
    }
    if (/\bcritical\b/.test(t) && /finding|vulnerabilit|issue|risk/.test(t) && !/no critical|not critical|zero critical/.test(t)) {
      return { status: "fail", detail: "Audit answer reports critical-level risk." };
    }
    if (/\bhigh severity\b|\breentrancy\b|\baccess control\b/.test(t)) return { status: "warn", detail: "Audit answer mentions high-severity classes (reentrancy / access control / high severity); unstructured answer, human review advised." };
    return { status: "warn", detail: "Audit answer was unstructured; no explicit risk rating could be extracted." };
  },
  holders(body) {
    const a = answerOf(body);
    const n = Number(a.holders_count ?? a.holder_count ?? a.holders);
    if (!Number.isFinite(n)) return { status: "error", detail: "Holder count missing from the answer." };
    if (n >= 1000) return { status: "pass", detail: `${n} distinct holders.` };
    if (n >= 100) return { status: "warn", detail: `Only ${n} distinct holders: thin distribution.` };
    return { status: "fail", detail: `Only ${n} distinct holders: extreme concentration for a listing.` };
  },
  treasury(body) {
    const a = answerOf(body);
    const bal = Number(a.balance_gwei ?? NaN);
    const tx = Number(a.tx_count ?? NaN);
    if (!Number.isFinite(bal) && !Number.isFinite(tx)) return { status: "error", detail: "Treasury read returned no balance or transaction count." };
    if ((tx === 0 || !Number.isFinite(tx)) && (bal === 0 || !Number.isFinite(bal))) {
      return { status: "warn", detail: "Treasury address shows no balance and no transactions at the checked block: dormant or wrong address." };
    }
    return { status: "pass", detail: `Treasury live on chain (balance ${Number.isFinite(bal) ? bal + " gwei" : "?"}, tx count ${Number.isFinite(tx) ? tx : "?"}).` };
  },
  sanctions(body) {
    const a = answerOf(body);
    const score = Number(a.match_score ?? NaN);
    const matches = Array.isArray(a.matches) ? a.matches.length : 0;
    if (a.matched === true || (Number.isFinite(score) && score >= 0.8) || matches > 0) {
      return { status: "fail", detail: `Sanctions match reported (matched=${a.matched}, score=${Number.isFinite(score) ? score : "?"}, matches=${matches}).` };
    }
    if (Number.isFinite(score) && score >= 0.5) return { status: "warn", detail: `Partial sanctions similarity (score ${score}) with no confirmed match.` };
    return { status: "pass", detail: "No sanctions match." };
  },
  social(body) {
    const a = answerOf(body);
    const verdict = String(a.verdict || "");
    const score = Number(a.bot_score ?? NaN);
    if (/likely bot/i.test(verdict) || (Number.isFinite(score) && score > 0.7)) return { status: "fail", detail: `Social account judged likely automated (verdict: ${verdict || "?"}, bot score ${Number.isFinite(score) ? score : "?"}).` };
    if (/possibly|uncertain|insufficient/i.test(verdict) || (Number.isFinite(score) && score > 0.4)) return { status: "warn", detail: `Social authenticity uncertain (verdict: ${verdict || "?"}, bot score ${Number.isFinite(score) ? score : "?"}).` };
    if (/likely human/i.test(verdict) || Number.isFinite(score)) return { status: "pass", detail: `Social account judged likely human (verdict: ${verdict || "?"}, bot score ${Number.isFinite(score) ? score : "?"}).` };
    return { status: "error", detail: "Social answer carried no verdict or bot score." };
  },
  code(body) {
    const a = answerOf(body);
    const verdict = String(a.verdict || "");
    const findings = Array.isArray(a.findings) ? a.findings : [];
    const severe = findings.some((f) => /critical|high/i.test(String(f?.severity || f)));
    if (/request changes/i.test(verdict)) {
      return severe
        ? { status: "fail", detail: `Code review requests changes with high-severity findings (${findings.length} findings).` }
        : { status: "warn", detail: `Code review requests changes (${findings.length} findings).` };
    }
    if (/approve/i.test(verdict)) return { status: "pass", detail: `Code review verdict: ${verdict}.` };
    if (/comment/i.test(verdict)) return { status: "warn", detail: `Code review verdict: ${verdict}.` };
    return { status: "error", detail: "Code review answer carried no verdict." };
  },
};

export class ListingsDesk {
  constructor({ client = new TelegraphClient(), chain = null } = {}) {
    this.client = client;
    this.chain = chain;
  }

  async #check(id, title, intent, askArgs) {
    const started = Date.now();
    try {
      const r = await this.client.ask({ intent, ...askArgs });
      const scored = scorers[id](r.body);
      let signalVerification = [];
      for (const hash of r.signalHashes) {
        try {
          const v = await this.client.verifySignal(hash);
          signalVerification.push({ hash, verified: true, node_status: v?.status ?? v?.verification?.status ?? "returned" });
        } catch {
          signalVerification.push({ hash, verified: false });
        }
      }
      return {
        id, title, intent,
        status: scored.status, detail: scored.detail,
        evidence: answerOf(r.body),
        purchase: {
          cost_uusdc: r.billedUusdc,
          cost_usd: r.billedUusdc / 1e6,
          signal_hashes: r.signalHashes,
          signal_verification: signalVerification,
          fulfillment: r.body?.fulfillment ?? undefined,
          receipt: r.receipt ?? undefined,
        },
        latency_ms: Date.now() - started,
      };
    } catch (err) {
      return { id, title, intent, status: "error", detail: String(err.message || err), purchase: { cost_uusdc: 0, cost_usd: 0, signal_hashes: [] }, latency_ms: Date.now() - started };
    }
  }

  async review(app) {
    const problems = validateApplication(app);
    if (problems.length) {
      const err = new Error("Invalid listing application: " + problems.join("; "));
      err.problems = problems;
      throw err;
    }
    const chainName = app.token.chain || "ethereum";
    const jobs = [];

    jobs.push(this.#check("audit", "Smart contract audit", INTENTS.audit, {
      query: `Audit the smart contract at ${app.token.address} on ${chainName}. Report reentrancy, access control, overflow, delegatecall and selfdestruct risks with an overall risk rating.`,
    }));
    jobs.push(this.#check("holders", "Holder concentration", INTENTS.holders, {
      params: { token: app.token.address, chain: chainName },
    }));
    if (Array.isArray(app.treasury) && app.treasury.length) {
      let block = app.block;
      if (block === undefined && this.chain) {
        try { block = Number(await this.chain.pub.getBlockNumber()); } catch { /* fall through */ }
      }
      if (block !== undefined) {
        jobs.push(this.#check("treasury", "Treasury state", INTENTS.treasury, {
          params: { address: app.treasury[0], block, chain: chainName, metric: "balance" },
        }));
      }
    }
    for (const [i, name] of app.entities.entries()) {
      jobs.push(this.#check("sanctions", `Sanctions screening — ${name}`, INTENTS.sanctions, { params: { name } })
        .then((c) => ({ ...c, id: `sanctions_${i}` })));
    }
    jobs.push(this.#check("social", "Social authenticity", INTENTS.social, { params: { account: app.social } }));
    if (app.code) {
      jobs.push(this.#check("code", "Code review", INTENTS.code, { params: { code: app.code } }));
    }

    const checks = await Promise.all(jobs);
    return this.#memo(app, checks);
  }

  async #memo(app, checks) {
    let score = 100;
    const reasons = [];
    let hasFail = false, hasError = false;
    for (const c of checks) {
      if (c.status === "fail") { score -= 40; hasFail = true; reasons.push(`${c.title}: FAIL — ${c.detail}`); }
      else if (c.status === "warn") { score -= 12; reasons.push(`${c.title}: WARN — ${c.detail}`); }
      else if (c.status === "error") { score -= 8; hasError = true; reasons.push(`${c.title}: ERROR — ${c.detail}`); }
    }
    score = Math.max(0, score);
    const recommendation = hasFail ? "REJECT" : hasError ? "MANUAL REVIEW" : score >= 80 ? "LIST" : score >= 55 ? "MANUAL REVIEW" : "REJECT";
    const totalUusdc = checks.reduce((s, c) => s + (c.purchase?.cost_uusdc || 0), 0);

    const memo = {
      memo: "ListGuard listing risk memo",
      version: 1,
      generated_at: new Date().toISOString(),
      network: "Telegraph testnet — beta 2 (Ethereum Sepolia escrow)",
      application: { project: app.project, token: app.token, entities: app.entities, treasury: app.treasury || [], social: app.social },
      checks,
      totals: {
        purchases: checks.filter((c) => c.purchase?.cost_uusdc > 0).length,
        cost_uusdc: totalUusdc,
        cost_usd: totalUusdc / 1e6,
      },
      risk_score: score,
      recommendation,
      reasons,
    };
    // Sign the memo: hash the canonical memo, sign the hash with the desk key.
    const canonical = JSON.stringify(memo);
    const memoHash = keccak256(toHex(canonical));
    if (this.client.account) {
      const signature = await this.client.account.signMessage({ message: memoHash });
      memo.verification = { memo_hash: memoHash, signer: this.client.address, signature, method: "EIP-191 personal_sign of keccak256(canonical memo JSON)" };
    }
    return memo;
  }
}

export async function verifyMemoSignature(memo) {
  if (!memo?.verification) return false;
  const { verification, ...rest } = memo;
  const hash = keccak256(toHex(JSON.stringify(rest)));
  if (hash !== verification.memo_hash) return false;
  const recovered = await recoverMessageAddress({ message: hash, signature: verification.signature });
  return recovered.toLowerCase() === verification.signer.toLowerCase();
}

export function renderMemoMarkdown(memo) {
  const lines = [];
  lines.push(`# Listing risk memo — ${memo.application.project}`);
  lines.push("");
  lines.push(`**Recommendation: ${memo.recommendation}** · Risk score: ${memo.risk_score}/100`);
  lines.push(`Network: ${memo.network} · Generated: ${memo.generated_at}`);
  lines.push(`Token: \`${memo.application.token.address}\` (${memo.application.token.chain || "ethereum"}) · Social: ${memo.application.social}`);
  lines.push("");
  lines.push("## Checks");
  for (const c of memo.checks) {
    lines.push(`- **${c.title}** (${c.intent}) — ${c.status.toUpperCase()}: ${c.detail}`);
    if (c.purchase?.signal_hashes?.length) lines.push(`  - signals: ${c.purchase.signal_hashes.join(", ")}`);
  }
  lines.push("");
  lines.push("## Cost line");
  for (const c of memo.checks) {
    if (c.purchase?.cost_uusdc) lines.push(`- ${c.title}: $${(c.purchase.cost_uusdc / 1e6).toFixed(4)} (${c.purchase.cost_uusdc} μUSDC)`);
  }
  lines.push(`- **Total intelligence cost: $${memo.totals.cost_usd.toFixed(4)} across ${memo.totals.purchases} paid Telegraph purchases**`);
  lines.push("");
  if (memo.verification) {
    lines.push("## Verification");
    lines.push(`Memo hash: \`${memo.verification.memo_hash}\``);
    lines.push(`Signed by: \`${memo.verification.signer}\` (${memo.verification.method})`);
    lines.push(`Signature: \`${memo.verification.signature}\``);
  }
  return lines.join("\n") + "\n";
}
