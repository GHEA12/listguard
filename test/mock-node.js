// A local fake Telegraph node for tests: implements the 402 escrow challenge,
// paid asks with canned per-intent answers, signal verification, and the
// ledger account read. Lets the whole desk run end to end with no network
// and no funds.

import { createServer } from "node:http";

const ANSWERS = {
  SMART_CONTRACT_AUDIT_GENERAL: { risk_rating: "low", summary: "No critical or high findings." },
  TOKEN_HOLDER_COUNT_GENERAL: { holders_count: 5432, token_symbol: "EXM" },
  ONCHAIN_METRIC_VERIFY_GENERAL: { balance_gwei: 123456, tx_count: 42 },
  SANCTIONS_SCREENING_MATCH_GENERAL: { matched: false, matches: [], match_score: 0.02, lists: ["OFAC SDN"] },
  SOCIAL_BOT_DETECTION_GENERAL: { verdict: "Likely human", bot_score: 0.08, signals: ["regular posting cadence"] },
  CODE_REVIEW_GENERAL: { verdict: "Approve", findings: [], summary: "Clean." },
};

export function startMockNode() {
  const server = createServer((req, res) => {
    const send = (code, obj, headers = {}) => {
      res.writeHead(code, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify(obj));
    };
    if (req.method === "POST" && req.url === "/engine/v1/ask") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        if (!req.headers["x-payment"]) {
          return send(402, {
            error: "payment required",
            accepts: [{
              scheme: "escrow",
              network: "eip155:11155111",
              payTo: "0x72a70e949362670Bf8bceAd24eFC5b8f950aa08b",
              amount: "10000",
              extra: {
                resource: "/v1/ask",
                message: "Telegraph Escrow Payment\n\nWallet: {from}\nPay To: 0x72a70e949362670bf8bcead24efc5b8f950aa08b\nNetwork: eip155:11155111\nAmount: 10000 uUSDC\nResource: /v1/ask\nNonce: {nonce}\nValid After: {validAfter}\nValid Before: {validBefore}",
              },
            }],
          });
        }
        const envelope = JSON.parse(Buffer.from(req.headers["x-payment"], "base64").toString("utf8"));
        if (envelope.scheme !== "escrow" || !envelope.payload?.signature) return send(400, { error: "bad payment envelope" });
        const bodyIn = JSON.parse(raw || "{}");
        const intent = bodyIn.intent || "CHAT_COMPLETION_GENERAL";
        let answer = { ...(ANSWERS[intent] || { text: "ok" }) };
        if (intent === "SANCTIONS_SCREENING_MATCH_GENERAL" && /bad/i.test(bodyIn.params?.name || "")) {
          answer = { matched: true, matches: [{ name: bodyIn.params.name, list: "OFAC SDN" }], match_score: 0.97, lists: ["OFAC SDN"] };
        }
        const signal = "0x" + Buffer.from(intent).toString("hex").padEnd(64, "0").slice(0, 64);
        const receipt = Buffer.from(JSON.stringify({ amount_uusdc: 10000, scheme: "escrow" })).toString("base64");
        return send(200, {
          ...answer,
          signal_hash: signal,
          fulfillment: { status: "complete", payments: [{ amount_uusdc: 10000, miner_id: "mock-miner-1" }] },
        }, { "X-PAYMENT-RESPONSE": receipt });
      });
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/engine/v1/signal/")) {
      return send(200, { status: "finalized", verification: { status: "verified" } });
    }
    if (req.method === "GET" && req.url.startsWith("/v1/ledger/account/")) {
      return send(200, { available: "5000000", balance: "5000000", unbilled: "0", deposited: "5000000" });
    }
    return send(404, { error: "not found" });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}
