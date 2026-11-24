// A tiny reviewer-facing web UI + JSON API (node:http, no dependencies).
// A judge can paste a listing application, watch the desk buy its intelligence
// through Telegraph, and inspect the signed memo and the purchase ledger.

import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";
import { TelegraphClient } from "./telegraph.js";
import { Chain } from "./chain.js";
import { ListingsDesk, renderMemoMarkdown } from "./desk.js";

const page = `<!doctype html>
<meta charset="utf-8"><title>ListGuard — autonomous listings desk</title>
<style>body{font-family:system-ui;max-width:860px;margin:2rem auto;padding:0 1rem}textarea{width:100%;height:220px}pre{background:#f4f4f4;padding:1rem;overflow:auto}button{padding:.5rem 1rem;font-size:1rem}</style>
<h1>ListGuard — the autonomous listings desk</h1>
<p>Paste a listing application. ListGuard buys six intelligence checks through
Telegraph (testnet, escrow-paid, ~$0.01 each), verifies every signal on the
node, and returns a signed listing risk memo with a cost line.</p>
<textarea id="app">${""}</textarea>
<p><button id="go">Run listing review</button> <span id="status"></span></p>
<pre id="out"></pre>
<script>
const sample = {
  project: "Example Token",
  token: { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", chain: "ethereum" },
  entities: ["Uniswap Labs"],
  treasury: ["0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"],
  social: "@Uniswap",
  code: "contract Example { function f() public { tx.origin.call(''); } }"
};
document.getElementById('app').value = JSON.stringify(sample, null, 2);
document.getElementById('go').onclick = async () => {
  const status = document.getElementById('status'), out = document.getElementById('out');
  status.textContent = 'Buying intelligence through Telegraph…';
  out.textContent = '';
  try {
    const res = await fetch('/api/review', { method: 'POST', headers: {'Content-Type':'application/json'}, body: document.getElementById('app').value });
    const data = await res.json();
    status.textContent = res.ok ? 'Done.' : 'Failed.';
    out.textContent = data.markdown || JSON.stringify(data, null, 2);
  } catch (e) { status.textContent = 'Failed.'; out.textContent = String(e); }
};
</script>`;

export function serve(port = 8787) {
  const client = new TelegraphClient();
  const desk = new ListingsDesk({ client, chain: new Chain() });
  const server = createServer(async (req, res) => {
    const send = (code, obj, type = "application/json") => {
      res.writeHead(code, { "Content-Type": type });
      res.end(typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
    };
    try {
      if (req.method === "GET" && req.url === "/") return send(200, page, "text/html");
      if (req.method === "GET" && req.url === "/api/status") {
        const l = client.address ? await client.ledgerAccount() : null;
        return send(200, {
          desk_wallet: client.address,
          escrow_spendable_usd: l ? Number(l.available || 0) / 1e6 : null,
          spent_today_usd: client.spentTodayUusdc() / 1e6,
          caps: { per_run_usd: config.maxPerRunUsd, per_day_usd: config.maxPerDayUsd },
        });
      }
      if (req.method === "GET" && req.url === "/api/ledger") {
        const p = join(config.ledgerDir, "ledger.jsonl");
        const rows = existsSync(p) ? readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
        return send(200, rows);
      }
      if (req.method === "POST" && req.url === "/api/review") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const app = JSON.parse(raw);
        const memo = await desk.review(app);
        return send(200, { memo, markdown: renderMemoMarkdown(memo) });
      }
      return send(404, { error: "not found" });
    } catch (e) {
      return send(400, { error: String(e.message || e), problems: e.problems });
    }
  });
  server.listen(port, () => console.log(`ListGuard reviewer UI on http://localhost:${port}`));
  return server;
}
