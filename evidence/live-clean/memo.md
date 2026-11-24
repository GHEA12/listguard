# Listing risk memo — Uniswap (UNI) — sample listing application

**Recommendation: MANUAL REVIEW** · Risk score: 68/100
Network: Telegraph testnet — beta 2 (Ethereum Sepolia escrow) · Generated: 2026-11-24T23:24:44.514Z
Token: `0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984` (ethereum) · Social: @Uniswap

## Checks
- **Smart contract audit** (SMART_CONTRACT_AUDIT_GENERAL) — WARN: Audit answer mentions high-severity classes (reentrancy / access control / high severity); unstructured answer, human review advised.
  - signals: 0x0e17fd23b7b1ff05cc073bc66c2bffb752a8d4643ad1c5feafdbc534afc33d12
- **Holder concentration** (TOKEN_HOLDER_COUNT_GENERAL) — PASS: 432087 distinct holders.
  - signals: 0xb81a2be3ec5cf89e2fa047c32f65c0a927e734b750e4edcb7095e633c0d6c3fd
- **Treasury state** (ONCHAIN_METRIC_VERIFY_GENERAL) — PASS: Treasury live on chain (balance 0 gwei, tx count 1).
  - signals: 0x8d37558ab525459ef66d18c16021671f8efd059a6409daec80bf5ffd2b14ea78
- **Sanctions screening — Uniswap Labs** (SANCTIONS_SCREENING_MATCH_GENERAL) — WARN: Partial sanctions similarity (score 0.75) with no confirmed match.
  - signals: 0xc7bdd2257600e29aba09aa37e808bde13cb0f4a1f1b515e3a0d4a936cc047514
- **Social authenticity** (SOCIAL_BOT_DETECTION_GENERAL) — ERROR: Social answer carried no verdict or bot score.
  - signals: 0x24da1156bbad09c2992ac44059bdfeaa689d65af2a682a3691487da673d5d3a9
- **Code review** (CODE_REVIEW_GENERAL) — PASS: Code review verdict: Approve.
  - signals: 0x05823993bf1314b17b547383cfdf1ce1f8d143a969668d3b265b9681bdd19926

## Cost line
- Smart contract audit: $0.2600 (260000 μUSDC)
- Holder concentration: $0.0100 (10000 μUSDC)
- Treasury state: $0.0100 (10000 μUSDC)
- Sanctions screening — Uniswap Labs: $0.0100 (10000 μUSDC)
- Social authenticity: $0.0100 (10000 μUSDC)
- Code review: $0.0100 (10000 μUSDC)
- **Total intelligence cost: $0.3100 across 6 paid Telegraph purchases**

## Verification
Memo hash: `0xdc824bea51b69519849bd37db1347b7ae81eb00ca5d800097b8a377b46f14209`
Signed by: `0x2B621C1dCf0bbc03C7aBceb023996d4570E4BA26` (EIP-191 personal_sign of keccak256(canonical memo JSON))
Signature: `0x8e5876e0d03ef4ceea636e85cf37eb10f8e4d839e1b422f84634a30d65cbfc964c66b19066c8e8d0af0ef615589172dc5ec876883f69d24323731972f91d203d1c`
