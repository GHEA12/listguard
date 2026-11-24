// ListGuard configuration. Everything network-shaped defaults to the live
// Telegraph beta-2 testnet (Ethereum Sepolia), matching the official client
// (github.com/telegraphprotocol/telegraph-mcp) defaults.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = new URL("..", import.meta.url).pathname;

export function loadEnvFile(path = join(ROOT, ".env")) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadEnvFile();

const num = (raw, fallback) => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const config = {
  nodeUrl: (process.env.TELEGRAPH_URL || "https://devnode.telegraphprotocol.com").replace(/\/+$/, ""),
  privateKey: process.env.TELEGRAPH_PRIVATE_KEY || "",
  diamond: process.env.TELEGRAPH_DIAMOND || "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b",
  chainId: 11155111, // Ethereum Sepolia
  rpcUrl: process.env.TELEGRAPH_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
  // Test USDC: Telegraph's own test token on Sepolia (freely mintable).
  usdc: "0xcc194e1a843B658526D0D5C431f670028582Ae17",
  // Spend safety: enforced before any payment signature is made.
  maxPerRunUsd: num(process.env.LISTGUARD_MAX_PER_RUN_USD, 0.5),
  maxPerDayUsd: num(process.env.LISTGUARD_MAX_PER_DAY_USD, 5),
  maxBudgetUusdc: 260000, // the most the testnet node takes per routed ask
  ledgerDir: process.env.LISTGUARD_LEDGER_DIR || join(ROOT, "ledger"),
  askTimeoutMs: 120000,
};
