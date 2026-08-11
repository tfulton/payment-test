# M1-S4 — Marketplace lifecycle and UI evidence

Date: 2026-08-07
Environment: Checkbook Sandbox only
Status: Implementation review-ready; live payment not yet submitted

## Lifecycle rule

Checkbook's Marketplace guide identifies `IN_PROCESS` as autodeposit in
progress. Its payment lifecycle documentation identifies `PAID` as the final
successful state where Checkbook has sent funds to the recipient account.

The POC therefore:

- queries `GET /v3/check/{id}` under the treasury sender's Marketplace credentials;
- retains the exact Checkbook status on the final `digital_payment` operation;
- normalizes `UNPAID` to submitted and `IN_PROCESS` to processing without
  releasing or settling the ISD reservation;
- settles the ISD cash-out exactly once only when Checkbook reports `PAID`;
- marks unexpected terminal or unknown states `action_required` and holds the
  reservation for reconciliation.

Status refresh never calls Checkbook's payment creation, deposit, webhook, or
Sandbox status-mutation endpoints.

## UI evidence

The Marketplace page now includes a dedicated cash-out history card. Each entry
shows amount, treasury wallet source, masked persisted bank destination,
exact Checkbook status, normalized ISD status, provider payment ID, and an
explicit status-refresh action while the cash-out is unresolved.

The shared immutable ISD ledger remains below the provider-focused history and
records payment-method snapshots on reservation and settlement entries.

## Isolated validation

The Marketplace lifecycle test proves:

- `IN_PROCESS` leaves the amount in the ISD reserved bucket;
- `PAID` moves the amount from reserved to paid exactly once;
- history retains the Checkbook status, masked bank, and requested ACH rail;
- the lookup uses the participant's Checkbook credentials.

No live Checkbook Sandbox payment was submitted while implementing this slice.
