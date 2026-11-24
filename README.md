# ListGuard — the autonomous listings desk

**Telegraph Hackathon Season II · Apps & Agents track · Mission 01: Exchange**

A token listing application goes in. ListGuard — an autonomous agent — buys six
intelligence checks through Telegraph in parallel, verifies every answer's
signal on the node, and returns a **signed listing risk memo** with a **cost
line** at the bottom: what was checked, what the ranked miners answered, what
each answer cost, and a LIST / MANUAL REVIEW / REJECT recommendation.

Listing reviews today take weeks of analyst time. A ListGuard memo takes about
a minute and about **$0.31** of intelligence (testnet USDC; five of the six
Telegraph asks bill $0.01 each, the contract audit bills $0.26 per ask on the
live node).

## What it buys (all through Telegraph, escrow-paid)

| Check | Intent | What it answers |
|---|---|---|
| Smart contract audit | `SMART_CONTRACT_AUDIT_GENERAL` | Reentrancy, access control, overflow, delegatecall, selfdestruct risk |
| Holder concentration | `TOKEN_HOLDER_COUNT_GENERAL` | How many distinct wallets hold the token |
| Treasury state | `ONCHAIN_METRIC_VERIFY_GENERAL` | Treasury wallet balance / activity at a named block |
| Sanctions screening | `SANCTIONS_SCREENING_MATCH_GENERAL` | Project and team entities against sanctions lists |
| Social authenticity | `SOCIAL_BOT_DETECTION_GENERAL` | Is the project's social following real or botted |
| Code review | `CODE_REVIEW_GENERAL` | Verdict and findings on submitted contract code |

Every purchase is a genuine autonomous machine-to-machine payment: the node
answers `POST /engine/v1/ask` with a 402, ListGuard signs the **escrow**
challenge (EIP-191) from its own testnet wallet, and the ask is charged to its
Telegraph escrow balance. Each answer's `signal_hash` is then verified against
the node (`GET /engine/v1/signal/{hash}`). Reviewers can inspect the purchase
ledger from the live runs in `evidence/ledger.jsonl` — intent, cost in μUSDC,
signal hashes, receipt — as accounting evidence. The memo itself is hash-stamped and signed by the desk
wallet, so anyone can verify a memo was issued by the desk and not altered.

> Network note: the x402 "exact" rail on Base Sepolia is currently failing at
> settlement (see telegraphprotocol/bounties#214). ListGuard therefore pays
> through the Telegraph escrow rail on Ethereum Sepolia, which the node offers
> on every 402 challenge and which is the default rail of the official client.

## Run it

Prerequisites: Node.js ≥ 20. Everything runs on **testnet** — no real funds.

```bash
npm install

# 1. Create the desk's burner wallet (once). The key is saved to .env (mode 600).
node src/cli.js wallet

# 2. Give the wallet a little Sepolia ETH for gas (any public Sepolia faucet),
#    then mint test USDC and deposit some into Telegraph escrow:
node src/cli.js fund            # mints 20 test USDC, deposits 5 into escrow
node src/cli.js status          # wallet balances + escrow + today's spend

# 3. Run a listing review:
node src/cli.js review --input examples/application.json --out output/

# 4. Or use the reviewer web UI:
node src/cli.js serve           # http://localhost:8787
```

Tests (no network, no funds — a local mock Telegraph node):

```bash
npm test
```

## Sample request

`examples/application.json` — a listing application for a real token contract
(UNI), with project entities, a treasury address, the project social handle,
and a code sample. Expected result: a memo (`output/memo.json` + `memo.md`)
whose checks are the six purchases above, a risk score, a recommendation, a
cost line totalling the μUSDC actually billed, signal hashes with their node
verification, and the desk's signature over the memo hash
(`node src/cli.js review` prints "Memo signature valid: true").

## Safety and spending limits

- Hard caps enforced **before** any payment signature: `LISTGUARD_MAX_PER_RUN_USD`
  (default $0.50) and `LISTGUARD_MAX_PER_DAY_USD` (default $5), counted from the
  local purchase ledger.
- A check that errors is marked **ERROR** and forces the recommendation to
  MANUAL REVIEW. It never silently passes.
- A confirmed sanctions match is a hard **REJECT**.
- The wallet is a fresh testnet burner. Its key lives only in `.env`
  (gitignored, mode 600). Never point ListGuard at a wallet holding real funds.

## Known limitations

- Testnet miners are independent third parties: answer quality and latency
  vary. ListGuard treats miner output as *evidence to be scored*, never as
  ground truth, and the memo shows the raw evidence for every check.
- Holder count is a concentration proxy, not a full distribution analysis.
- Sanctions screening runs on entity names (what the network's Intent takes);
  address-level screening depends on Provider coverage.
- Scores use the deterministic rules in `src/desk.js`; they are deliberately
  simple and auditable rather than learned.

## Layout

- `src/telegraph.js` — Telegraph client (402 → escrow signature → ask, signal verification, ledger)
- `src/chain.js` — Sepolia funding: mint test USDC, approve, `depositUSDC`
- `src/desk.js` — the listings desk: parallel checks, scoring, signed memo
- `src/cli.js`, `src/server.js` — CLI and reviewer web UI/API
- `test/` — mock Telegraph node + end-to-end tests
- `evidence/` — the live testnet run record: memos, purchase ledger, escrow snapshot

Built for Telegraph Hackathon Season II. Testnet only; test tokens have no value.
