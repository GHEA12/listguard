#!/usr/bin/env node
// ListGuard CLI: wallet | fund | status | review | serve

import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { config, ROOT } from "./config.js";
import { TelegraphClient } from "./telegraph.js";
import { Chain, newWallet, accountFromKey } from "./chain.js";
import { ListingsDesk, renderMemoMarkdown, verifyMemoSignature } from "./desk.js";
import { serve } from "./server.js";

const [cmd, ...args] = process.argv.slice(2);
const argVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  if (cmd === "wallet") {
    if (config.privateKey) {
      console.log(`Desk wallet already configured: ${accountFromKey().address}`);
      return;
    }
    const { privateKey, account } = newWallet();
    const envPath = join(ROOT, ".env");
    writeFileSync(envPath, `TELEGRAPH_PRIVATE_KEY=${privateKey}\n`, { mode: 0o600 });
    chmodSync(envPath, 0o600);
    console.log(`Created a fresh testnet burner wallet: ${account.address}`);
    console.log(`Key saved to ${envPath} (mode 600, gitignored). Back it up: it is the only copy.`);
    console.log("Next: it needs a little Sepolia ETH for gas, then run: node src/cli.js fund");
    return;
  }

  if (cmd === "status") {
    const client = new TelegraphClient();
    const chain = new Chain();
    const out = { desk_wallet: client.address || null };
    if (client.address) {
      out.wallet_balances = await chain.balances(client.address);
      const l = await client.ledgerAccount();
      out.escrow = {
        spendable_usd: Number(l.available || 0) / 1e6,
        balance_usd: Number(l.balance || 0) / 1e6,
        unbilled_usd: Number(l.unbilled || 0) / 1e6,
      };
      out.spent_today_usd = client.spentTodayUusdc() / 1e6;
    }
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (cmd === "fund") {
    const chain = new Chain();
    const account = accountFromKey();
    const before = await chain.balances(account.address);
    if (before.eth < 0.0005) {
      console.error(`Wallet ${account.address} holds ${before.eth} Sepolia ETH — too little for gas.`);
      console.error("Get free Sepolia ETH from a public faucet, then re-run fund.");
      process.exit(1);
    }
    const mintUsd = Number(argVal("--mint") || 20);
    const depositUsd = Number(argVal("--deposit") || 5);
    const r = await chain.fund(account, { mintUsd, depositUsd });
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  if (cmd === "review") {
    const input = argVal("--input");
    if (!input) { console.error("Usage: node src/cli.js review --input application.json [--out dir]"); process.exit(1); }
    const app = JSON.parse(readFileSync(input, "utf8"));
    const desk = new ListingsDesk({ client: new TelegraphClient(), chain: new Chain() });
    const memo = await desk.review(app);
    const md = renderMemoMarkdown(memo);
    const outDir = argVal("--out");
    if (outDir) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, "memo.json"), JSON.stringify(memo, null, 2));
      writeFileSync(join(outDir, "memo.md"), md);
      console.log(`Wrote ${join(outDir, "memo.json")} and memo.md`);
    }
    console.log(md);
    console.log(`Memo signature valid: ${await verifyMemoSignature(memo)}`);
    return;
  }

  if (cmd === "serve") {
    serve(Number(argVal("--port") || 8787));
    return;
  }

  console.log("ListGuard — commands: wallet | fund [--mint 20] [--deposit 5] | status | review --input app.json [--out dir] | serve [--port 8787]");
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
