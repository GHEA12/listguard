# Listing risk memo — NorthBridge Yield (NBY) — sample listing application (sanctions test case)

**Recommendation: REJECT** · Risk score: 8/100
Network: Telegraph testnet — beta 2 (Ethereum Sepolia escrow) · Generated: 2026-11-24T23:25:46.712Z
Token: `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` (ethereum) · Social: @NorthBridgeYield

## Checks
- **Smart contract audit** (SMART_CONTRACT_AUDIT_GENERAL) — WARN: Audit answer mentions high-severity classes (reentrancy / access control / high severity); unstructured answer, human review advised.
  - signals: 0x47a160a1be4e3148d3175fa06e1e00b99e06542d36e39d5b2fdbb4a1b78531de
- **Holder concentration** (TOKEN_HOLDER_COUNT_GENERAL) — PASS: 3353117 distinct holders.
  - signals: 0x54dc2a42aea4845a8c0b9a7e632f862cb9dd331e4c4782a00a9272c5c82d4763
- **Treasury state** (ONCHAIN_METRIC_VERIFY_GENERAL) — PASS: Treasury live on chain (balance 7202172.091867872 gwei, tx count ?).
  - signals: 0x8efc3a6d1187c2d225370d205414a56758ccc513eea9e3b1dd36bb55d3963ba9
- **Sanctions screening — Lazarus Group** (SANCTIONS_SCREENING_MATCH_GENERAL) — FAIL: Sanctions match reported (matched=true, score=1, matches=1).
  - signals: 0x82c179adb0727231a53a8f8e759afc04400c932f028f3a01a8857339bc0388d0
- **Social authenticity** (SOCIAL_BOT_DETECTION_GENERAL) — FAIL: Social account judged likely automated (verdict: inconclusive, bot score 0.8).
  - signals: 0x7b383dc91fcb48521a7255c688665c8e1ea25381bf9fc53772a6a588efd1ea42
- **Code review** (CODE_REVIEW_GENERAL) — PASS: Code review verdict: Approve.
  - signals: 0x0dcfd29dee3a557363791979173a38a1eec395c8d0fc54dcb1a8879ddbf14ad5

## Cost line
- Smart contract audit: $0.2600 (260000 μUSDC)
- Holder concentration: $0.0100 (10000 μUSDC)
- Treasury state: $0.0100 (10000 μUSDC)
- Sanctions screening — Lazarus Group: $0.0100 (10000 μUSDC)
- Social authenticity: $0.0100 (10000 μUSDC)
- Code review: $0.0100 (10000 μUSDC)
- **Total intelligence cost: $0.3100 across 6 paid Telegraph purchases**

## Verification
Memo hash: `0x09155414061f833cc7f65d6fa73ce7b4d2e95749016a87362c00217c6abd5779`
Signed by: `0x2B621C1dCf0bbc03C7aBceb023996d4570E4BA26` (EIP-191 personal_sign of keccak256(canonical memo JSON))
Signature: `0xd433e48599b5fe08bd9e203f0a2e51db71bfd96d26b9534f2d7f45b861562f6663deb3657e733a267804b4cd1f3632d8e434de78d17f25d1543c800fbc81aedb1b`
