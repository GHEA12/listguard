import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startMockNode } from "./mock-node.js";
import { config } from "../src/config.js";
import { TelegraphClient, SpendCapError } from "../src/telegraph.js";
import { ListingsDesk, verifyMemoSignature } from "../src/desk.js";

// Hardhat's well-known test account #0 — testnet/mock use only.
const TEST_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

let server, base, client;
const chainStub = { pub: { getBlockNumber: async () => 12345678n } };

const app = {
  project: "Example Token",
  token: { address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", chain: "ethereum" },
  entities: ["Example Labs Ltd"],
  treasury: ["0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"],
  social: "@exampletoken",
  code: "contract Example { uint256 public x; }",
};

before(async () => {
  server = await startMockNode();
  base = `http://127.0.0.1:${server.address().port}`;
  client = new TelegraphClient({
    ...config,
    nodeUrl: base,
    privateKey: TEST_KEY,
    ledgerDir: mkdtempSync(join(tmpdir(), "listguard-test-")),
  });
});
after(() => server.close());

test("a clean application is listed, with six paid purchases and a valid signed memo", async () => {
  const desk = new ListingsDesk({ client, chain: chainStub });
  const memo = await desk.review(app);
  assert.equal(memo.recommendation, "LIST");
  assert.equal(memo.checks.length, 6);
  assert.ok(memo.checks.every((c) => c.status === "pass"), JSON.stringify(memo.checks.map((c) => [c.id, c.status])));
  assert.equal(memo.totals.purchases, 6);
  assert.equal(memo.totals.cost_uusdc, 60000);
  assert.ok(memo.checks.every((c) => c.purchase.signal_verification.every((v) => v.verified)));
  assert.equal(await verifyMemoSignature(memo), true);
});

test("a sanctions match forces REJECT", async () => {
  const desk = new ListingsDesk({ client, chain: chainStub });
  const memo = await desk.review({ ...app, entities: ["Bad Actor"] });
  assert.equal(memo.recommendation, "REJECT");
  assert.ok(memo.checks.some((c) => c.status === "fail"));
});

test("an invalid application is rejected before any money moves", async () => {
  const desk = new ListingsDesk({ client, chain: chainStub });
  await assert.rejects(() => desk.review({ project: "Nope" }), /Invalid listing application/);
});

test("the spend cap refuses to sign above the per-run limit", async () => {
  const capped = new TelegraphClient({
    ...config, nodeUrl: base, privateKey: TEST_KEY,
    ledgerDir: mkdtempSync(join(tmpdir(), "listguard-cap-")),
    maxPerRunUsd: 0.001,
  });
  await assert.rejects(
    () => capped.ask({ intent: "TOKEN_HOLDER_COUNT_GENERAL", params: { token: app.token.address, chain: "ethereum" } }),
    SpendCapError,
  );
});
