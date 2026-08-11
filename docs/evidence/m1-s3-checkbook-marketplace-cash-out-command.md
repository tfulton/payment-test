# M1-S3 — Just-in-time Marketplace cash-out command

Date: 2026-08-07
Environment: Checkbook Sandbox only
Status: Implementation review-ready; live payment not yet submitted

## Implemented contract

- Reserves the operator-entered custom amount in the canonical ISD ledger.
- Refreshes Checkbook treasury and participant wallet balances before mutation.
- Requires a verified participant, wallet, and persisted verified Checkbook bank
  belonging to the selected Plaid payment method.
- Requires a zero participant-wallet balance as a reconciliation guard, but
  does not use that wallet for new cash-outs.
- Creates one durable `checkbook_marketplace` intent and a `digital_payment`
  directly from the ISD treasury wallet to the participant's persisted bank.
- Uses intent-derived Checkbook idempotency keys and reuses persisted operation
  IDs on retry. Ambiguous provider calls hold the ISD reservation for explicit
  reconciliation rather than releasing or routing elsewhere.
- Leaves ISD cash-out status at `submitted`; settlement/status normalization is
  the M1-S4 lifecycle slice.

## Isolated evidence

`payment-api/test/checkbook-marketplace-cash-out.test.js` uses a fresh temporary
SQLite database and mocked Checkbook responses. Its tests prove:

- the provider payment uses exactly `$10.00`, not the participant's complete
  ISD available balance;
- the source/destination is treasury wallet to the participant's persisted bank;
- replay with the same idempotency key creates no additional provider POST.
- a historical staged-wallet attempt is reversed idempotently before the direct
  payout, without duplicating the original treasury funding.

The new tests pass. The stale reservation test was also corrected to compare
the ledger before and after a rejected reservation; the canonical seed entry is
expected, while no new reservation entries may be posted.

## Live boundary

No live Checkbook Sandbox payment was submitted while implementing this slice.
The next controlled action is UI review followed by one explicitly approved
small ACH payout from the treasury wallet to Avery Owner's linked bank.
