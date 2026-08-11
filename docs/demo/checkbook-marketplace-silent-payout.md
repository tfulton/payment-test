# Checkbook Marketplace Silent Payout — Demo Runbook

Environment: Checkbook Sandbox only
Primary page: `http://localhost:3010/flows/plaid-checkbook-marketplace`
Recommended participant: Avery Owner (`owner1`)

## Preflight

1. From the repository root, run `npm run check && npm test && npm run build`.
2. Start the app with `npm run dev` and open the primary page.
3. Select Avery Owner and confirm:
   - the **NO PRODUCTION CALLS** indicator is visible;
   - the ISD treasury balance is available and exceeds the demo amount;
   - the participant wallet is `$0.00`;
   - the saved Plaid payout account and Checkbook attachment are verified.
4. Select **Refresh CBIO balance** immediately before the walkthrough.
5. Use a small unique amount such as `$3.00`; no database edits or Checkbook
   dashboard actions are required.

Last full rehearsal: 2026-08-10. A `$2.00` payout reached `IN_PROCESS`, was
advanced through the UI's Sandbox settlement action, independently read back as
`PAID`, and posted matching reserved-to-paid ledger entries. Checkbook payment:
`ba311761b4e84a3aaad6582ccfc95e18`.

## Five-minute walkthrough

1. Explain that Plaid Auth is the one-time bank connection. Show the saved
   masked account surviving reload without opening Plaid.
2. Show the ISD available-to-withdraw balance and Checkbook treasury capacity.
   The participant wallet remains zero because the payout is funded on demand.
3. Enter the custom amount and review:
   - ACH;
   - ISD treasury as source;
   - the persisted masked bank as destination.
4. Select **Cash out with Checkbook Marketplace**.
5. In history, show the durable Checkbook payment ID and `IN_PROCESS` status.
   No email claim, Checkbook page, deposit selection, or Plaid relink occurs.
6. Explain the Sandbox-only limitation, then select
   **Sandbox: simulate settlement → PAID**.
7. Show:
   - Checkbook status `PAID`;
   - normalized status `succeeded`;
   - the success confirmation;
   - matching reserved-to-paid entries in the immutable ISD ledger.

## Message to preserve

The POC proves a silent Checkbook Marketplace ACH payout in Sandbox: a bank is
connected once through Plaid, and later treasury-funded payouts reach the
persisted bank without per-payment recipient interaction. The manual `PAID`
step exists because Checkbook Sandbox does not advance payment status on its
own. It simulates provider settlement and does not prove production settlement,
production readiness, or RTP behavior.

## Contingencies

- If provider balance refresh fails, do not submit; retain the cached amount as
  stale evidence only and show the two existing `PAID` acceptance payments.
- If the saved bank is missing, use Plaid Link and then **Attach payout account
  to Checkbook**. Do not change credentials during the demo.
- If a submitted payment response is uncertain, leave the amount reserved and
  bound to Checkbook. Do not retry through another processor.
- Existing acceptance evidence is in
  `docs/evidence/m1-s5-checkbook-marketplace-end-to-end.md`.
