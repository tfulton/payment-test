# M1-S5 — Checkbook Marketplace silent payout proof

Date: 2026-08-07
Environment: Checkbook Sandbox only
Entity: Avery Owner (`owner1`)
Result: Silent autodeposit proven; Sandbox terminal simulation now available

## Provider finding

The original same-user participant-wallet-to-own-bank digital-payment payload
was rejected with HTTP 400: `JSON body parameters are invalid.` Checkbook's
Marketplace guide models silent payment as one Marketplace user paying another
onboarded Marketplace user. The POC therefore changed to the simpler target
flow:

```text
ISD treasury wallet -> Avery Marketplace identity -> persisted linked bank
```

No participant-wallet staging is required for new cash-outs.

## First payout — $10.00

Pre-state:

- treasury wallet: `$316,000.00`;
- participant wallet: `$0.00`;
- ISD available to withdraw: `$24,766.04`;
- destination: `Tartan Bank · Plaid Checking ••••0000`.

The rejected staging experiment had already moved `$10.00` into Avery's wallet.
The durable retry safely corrected it before payout:

- original wallet funding: `802a1fe1807f410dad497b0d80e97054` — `PAID`;
- wallet-to-treasury reversal: `5ff176b3241f427e9324e6bb063818fc` — `PAID`;
- treasury-to-linked-bank payout: `4220816773854737b62fac95ed42b0ea`
  — `IN_PROCESS`.

Post-state:

- treasury wallet: `$315,990.00`;
- participant wallet: `$0.00`;
- ISD available to withdraw: `$24,756.04`;
- the `$10.00` remains in the ISD reserved bucket pending Checkbook `PAID`.

## Repeat payout after reload — $1.00

After a full page reload, the masked bank, first payment ID/status, treasury
balance, participant-wallet balance, and history remained available without
Plaid Link. A second payout used the same linked bank:

- treasury-to-linked-bank payout: `5a0a5db53b004a64a092e04f03b4ee90`
  — `IN_PROCESS`;
- treasury wallet after submission: `$315,989.00`;
- participant wallet remained `$0.00`;
- ISD available to withdraw became `$24,755.04`.

## Silent UX conclusion

Both direct payouts reached Checkbook autodeposit without an email claim page,
deposit-method selection, Plaid relink, or recipient action. Repeated read-only
status refreshes continued to report `IN_PROCESS`, which is the strongest
Sandbox state initially observed. On 2026-08-10, Checkbook Support clarified
that Sandbox payments remain `IN_PROCESS` indefinitely unless the payment
creator calls `PUT /v3/check/webhook/{check_id}` with `{"status":"PAID"}`.
The lab now exposes that simulation as a clearly labeled Sandbox-only action,
then independently reads the payment and settles the ISD reservation only when
Checkbook returns `PAID`.

## Terminal Sandbox validation — 2026-08-10

Using the treasury sender/payment creator credentials, the POC advanced and
then independently refreshed both live bank payouts:

- `$10.00`: `4220816773854737b62fac95ed42b0ea` — `PAID`;
- `$1.00`: `5a0a5db53b004a64a092e04f03b4ee90` — `PAID`.

For each payout, the flow was:

1. call `PUT /v3/check/webhook/{check_id}` with `{"status":"PAID"}`;
2. call `GET /v3/check/{check_id}` with the same treasury credentials;
3. require the read response to report `PAID`;
4. atomically move that cash-out's ISD amount from reserved to paid.

Both local cash-outs and payment intents are now `succeeded`. The two terminal
postings increased Avery's paid bucket by exactly `$11.00`; replay is tested to
make no additional provider call or ledger posting.

## POC conclusion

**Supported in Checkbook Sandbox:** an onboarded Marketplace user can connect a
bank once through Plaid, then receive repeated treasury-funded ACH payouts to
that persisted bank without Plaid relink, email claim, deposit selection, or
other per-payout recipient interaction. Sandbox `PAID` is simulated provider
evidence, not proof of real bank settlement or production readiness.
