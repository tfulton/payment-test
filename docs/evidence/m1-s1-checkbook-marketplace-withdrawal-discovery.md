# M1-S1 — Checkbook Marketplace Withdrawal Discovery

Status: Review-ready · Captured: 2026-08-07 · Sandbox only

Phase: [Plaid Auth + Checkbook Marketplace Silent Payout](../architecture/phases/m1-checkbook-marketplace-silent-payout.md)

## Finding

Checkbook documents the primitives needed for a silent Marketplace payout, but
the exact same-user wallet-to-own-bank behavior is not explicitly illustrated.
The capability is therefore a **supported candidate requiring a controlled
Sandbox proof**, not yet a proven result.

The documented distinction is important:

- Marketplace-user payments are API-driven and do not send Checkbook recipient
  notifications.
- A Marketplace recipient can deposit a payment to a bank attached under that
  user's credentials.
- With a default bank and `BANK` in `deposit_options`, Checkbook documents
  autodeposit beginning in `IN_PROCESS` without a deposit-selection step.
- Payments to an external email/phone recipient use Checkbook's hosted recipient
  experience and do not meet our silent-payout definition.
- Checkbook's product overview explicitly lists account-to-account movement
  within one user, but the guide does not provide a same-user request example.

Official sources:

- [Marketplace payment guide](https://docs.checkbook.io/guides/marketplace/payments/)
- [Marketplace funds-flow overview](https://docs.checkbook.io/docs/products/marketplace/payments/)
- [Bank account guide](https://docs.checkbook.io/guides/accounts/bank/)
- [Idempotent requests](https://docs.checkbook.io/docs/api/idempotent-requests/)

## Candidate ACH operation

After M1-S2 attaches a verified Plaid-derived bank to `owner1`:

1. Authenticate as the `owner1` Marketplace user.
2. Create `POST /v3/check/digital` with:
   - `account`: Avery's funded Checkbook wallet ID;
   - `recipient`: Avery's Marketplace user reference;
   - `deposit_options`: `['BANK']`;
   - one persisted `Idempotency-Key` derived from the ISD payment intent.
3. If Checkbook returns `IN_PROCESS`, treat that as provider acceptance and
   autodeposit initiation, not settlement.
4. If Checkbook returns `UNPAID`, call
   `POST /v3/check/deposit/{check_id}` server-side under Avery's credentials
   with the persisted Checkbook bank ID.
5. Poll or refresh the exact payment/deposit status. Do not translate `PAID` or
   another provider status to ISD settlement until its observed Sandbox meaning
   is documented.

This sequence contains no browser deposit widget or recipient-selected deposit
method. The controlled test must still verify that a same-user recipient is
accepted and that Checkbook sends no actionable email or hosted-flow prompt.

## Credential and ownership contract

- The source wallet and destination bank both belong to `owner1`.
- Bank attachment and explicit deposit use `owner1` credentials.
- The browser receives only masked bank metadata and local/provider references.
- The payment intent is created before provider submission and permanently
  binds to `checkbook_marketplace`.
- Checkbook's idempotency key lasts 24 hours; local idempotency remains durable
  beyond that window and must prevent a second provider submission.

## Read-only Sandbox evidence

- `GET /v3/user` for `owner1` returned `VERIFIED`.
- The response exposed no autodeposit preference, so default behavior cannot be
  confirmed through the current user read model.
- `GET /v3/account/bank` returned no banks for `owner1`.
- `GET /v3/account/wallet` returned Avery's expected wallet with a $0 balance.
- No Checkbook mutation or money movement occurred in this slice.

## UI result

The Marketplace page now includes a **Silent payout discovery** card that:

- explains the wallet-to-Plaid-linked-bank candidate without claiming success;
- shows participant verification, wallet funds, and Checkbook bank readiness;
- lists concrete blockers;
- exposes no cash-out action before the controlled test capability is ready;
- labels provider-balance refresh time and distinguishes provider refresh from
  wallet funding.

The page now also refreshes the existing treasury and selected participant
wallet through Checkbook GET requests on load/entity change. The visible
treasury balance was validated at $316,000.00, with a manual **Refresh CBIO
balance** control and timestamp. This refresh cannot provision wallets or move
funds.

At the time of M1-S1, Avery blockers were recorded as:

1. participant wallet balance is $0;
2. the persisted Plaid method is not attached to the Checkbook user.

The later on-demand-funding decision supersedes the first item: a $0 wallet is
valid before cash-out. The persisted bank attachment completed in M1-S2.

## M1-S1 conclusion

M1-S1 is review-ready. Proceed to M1-S2 to attach Avery's persisted Plaid
method under Avery's Checkbook credentials, verify the resulting bank and
persistence, and then review before implementing or submitting a payout.

## M1-S5 resolution

Live Sandbox evidence resolved the discovery uncertainty. Checkbook rejected a
same-user participant-wallet-to-own-bank digital payment. The supported silent
path is treasury Marketplace user -> onboarded Avery Marketplace user, with
Avery's persisted bank selected by autodeposit. New cash-outs therefore bypass
the participant wallet.
