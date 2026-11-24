# Live testnet evidence — ListGuard (run 2026-11-25, Asia/Jakarta)

All activity is on the Telegraph beta-2 testnet (Ethereum Sepolia escrow rail)
with test tokens. Desk wallet: `0x2B621C1dCf0bbc03C7aBceb023996d4570E4BA26`.
Node: `https://devnode.telegraphprotocol.com`.

## 1. Funding (escrow deposit) — `node src/cli.js fund`

Wallet started with 0.05 Sepolia ETH (Google Cloud faucet, tx
`0x336ff69f588f504b377e7953aad4e12c510b0a8b59e8ea2983f311285082c9f5`).
The fund step minted 20 test USDC, approved the escrow diamond for 5, and
deposited 5 USDC. All three transactions confirmed successful on Sepolia:

| Step | Tx hash | Block | Status |
|---|---|---|---|
| mint 20 test USDC | `0xfe14c3dc115f0512eaad0ba2dc1a91ebbe29c73be661a50482f6f37a7a540d98` | 12205747 | success |
| approve diamond | `0x18b098ec6502d398296474c851100e34539eff085e09837d0f6ff08e463a466f` | 12205748 | success |
| depositUSDC 5 | `0x32baf85210b7cf5ee108956a50751906eb704756942e726825ffee3d119a149d` | 12205749 | success |

Escrow after funding: balance $5.00, spendable $5.00 (node ledger account).

## 2. Live run A — clean application (`examples/application.json`, Uniswap/UNI sample)

`node src/cli.js review --input examples/application.json --out evidence/live-clean`
Memo: `live-clean/memo.json` / `live-clean/memo.md`, generated 2026-11-24T23:24:44Z.

- **Recommendation: MANUAL REVIEW · risk score 68/100** — the honest live
  outcome. Three checks passed (holders 432,087; treasury live; code review
  Approve). The audit miner returned an unstructured answer mentioning
  high-severity classes (WARN by design), the sanctions miner reported a 0.75
  partial similarity for "Uniswap Labs" with no confirmed match (WARN), and
  the social miner's answer carried no verdict or bot score (ERROR). Per the
  desk's safety posture, WARN/ERROR never silently passes, so the memo lands
  on MANUAL REVIEW rather than LIST. (Against the mock node, the same clean
  application produces LIST — see `npm test`.)
- 6 paid purchases, total **$0.31** (audit $0.26; the other five $0.01 each).
- Memo hash `0xdc824bea51b69519849bd37db1347b7ae81eb00ca5d800097b8a377b46f14209`,
  signature re-verified from the saved file: **valid**.

## 3. Live run B — sanctions test case (`examples/application-sanctions.json`, entity "Lazarus Group")

`node src/cli.js review --input examples/application-sanctions.json --out evidence/live-sanctions`
Memo: `live-sanctions/memo.json` / `live-sanctions/memo.md`, generated 2026-11-24T23:25:46Z.

- **Recommendation: REJECT · risk score 8/100.**
- Sanctions screening returned a confirmed match from the live miner:
  `matched=true, match_score=1, matches=1` → hard FAIL, which forces REJECT.
  (Social also FAIL: bot score 0.8. Holders, treasury and code review PASS;
  audit WARN as in run A.)
- 6 paid purchases, total **$0.31**.
- Memo hash `0x09155414061f833cc7f65d6fa73ce7b4d2e95749016a87362c00217c6abd5779`,
  signature re-verified from the saved file: **valid**.

## 4. Purchase ledger and verification

- `evidence/ledger.jsonl` (copy of `ledger/ledger.jsonl`): 12 purchase rows,
  one per paid ask across both runs, totalling **620,000 μUSDC = $0.62**.
- 10 of 12 purchases carry the node's escrow receipt in the ledger
  (`receipt_hash`, serving miner, epoch 51). The two SMART_CONTRACT_AUDIT
  purchases (260,000 μUSDC each) returned no `X-PAYMENT-RESPONSE` receipt
  object; their billed amount comes from the response's fulfillment payment
  rows, and their signals verify on the node like the others.
- All 12 signal hashes were verified against the node during the runs
  (recorded per check in each memo's `signal_verification`), and three were
  re-resolved independently after the runs
  (`GET /engine/v1/signal/{hash}` returns the full signal record).
- Escrow after both runs (`evidence/status-after-runs.json`): balance $5.00,
  spendable $4.83, unbilled $0.17 — the node's epoch ledger still settling at
  check time; `spent_today` per the desk ledger is $0.62, inside the $0.50
  per-ask / $5 per-day caps (no single ask exceeded $0.26).
- Mock-node test suite after the live runs: `npm test` — 4/4 pass (clean →
  LIST with 6 purchases; sanctions match → REJECT; invalid application
  refused pre-payment; spend cap refuses to sign).

## 5. Observed live pricing (corrects the earlier estimate)

On the live node, five of the six Intents bill $0.01 per answer, but
SMART_CONTRACT_AUDIT_GENERAL bills $0.26 per ask (the node's per-ask budget
cap of 260,000 μUSDC). A full six-check memo therefore costs **$0.31** of
test USDC on the live testnet, not ≈ $0.06 as estimated before the live run.
