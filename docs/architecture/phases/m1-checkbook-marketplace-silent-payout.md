# Phase M1 — Plaid Auth + Checkbook Marketplace Silent Payout

Status: Supported POC conclusion · Sandbox only · Last updated: 2026-08-10

Current checkpoint: M1-S5 reached Checkbook autodeposit without recipient
interaction. Checkbook Support confirmed that Sandbox payments remain
`IN_PROCESS` until advanced through `PUT /v3/check/webhook/{check_id}` using the
payment creator's credentials. The lab exposes that mutation as an explicit
Sandbox-only action and settles the ISD reservation only after a follow-up read
returns `PAID`. See
[M1-S0 Sandbox baseline evidence](../../evidence/m1-s0-checkbook-marketplace-baseline.md)
and [M1-S1 withdrawal discovery](../../evidence/m1-s1-checkbook-marketplace-withdrawal-discovery.md)
and [M1-S2 persisted payout destination](../../evidence/m1-s2-checkbook-marketplace-payout-destination.md)
and [M1-S3 just-in-time command evidence](../../evidence/m1-s3-checkbook-marketplace-cash-out-command.md)
and [M1-S4 lifecycle evidence](../../evidence/m1-s4-checkbook-marketplace-lifecycle.md)
and [M1-S5 end-to-end evidence](../../evidence/m1-s5-checkbook-marketplace-end-to-end.md).

Both live acceptance payouts were advanced with the documented Sandbox endpoint
on 2026-08-10 and independently read back as `PAID`. Their ISD reservations
settled exactly once. This closes the ACH silent-payout capability question as
**Supported in Sandbox**, while leaving production enablement and operating
requirements outside the POC conclusion.

M1-S7 demo readiness was rehearsed end to end on 2026-08-10 with a fresh
`$2.00` UI payout. It progressed from `IN_PROCESS` through the explicit
Sandbox settlement action to provider-confirmed `PAID`, with matching immutable
ledger entries and no browser console errors. The presenter runbook is
[Checkbook Marketplace Silent Payout — Demo Runbook](../../demo/checkbook-marketplace-silent-payout.md).

## Outcome

Prove whether an onboarded Checkbook Marketplace participant can connect an
external bank once through Plaid Auth and later cash out from their funded
Marketplace wallet to that bank without an email-directed Checkbook deposit
flow or any additional recipient interaction.

This is a capability experiment, not a production funds-flow design. A negative
or constrained result is a valid outcome when supported by provider evidence.

## Definition of "silent"

After the one-time Plaid Link session, a repeat payout is initiated entirely by
the POC server and:

- targets the persisted bank owned by the selected Marketplace participant;
- does not send the recipient through a Checkbook-hosted claim or deposit flow;
- does not require the recipient to select a deposit method, re-enter bank
  details, or approve the individual payout;
- returns a durable Checkbook payment/transfer identifier and observable status.

Provider notifications, legally required notices, or bank posting delays do not
by themselves make the flow non-silent. Any per-payout recipient action does.

## Existing baseline

- Four demo entities have canonical balances in `isd_ledger_entries`.
- The dedicated Marketplace treasury and participant users/wallets are
  provisioned in Checkbook Sandbox.
- Treasury-to-participant wallet funding remains a historical lab capability,
  but the proven cash-out path pays directly from treasury to the participant.
- Plaid Items and selected accounts persist in SQLite across app restarts.
- A Plaid processor token can be exchanged under a participant's Checkbook
  credentials and the resulting Checkbook bank ID is persisted.
- Same-user participant-wallet-to-own-bank payment was rejected by Checkbook;
  treasury-to-participant-bank autodeposit is implemented and proven.

## Funds and accounting model

```text
ISD ledger entitlement
        |
        | reserve exact custom cash-out amount
        v
Checkbook treasury wallet
        |
        | Marketplace payment to onboarded participant
        v
Participant's Plaid-linked external bank (autodeposit)
```

`isd_ledger_entries` remains the entitlement authority. Checkbook wallet and
bank states are provider-side settlement evidence. A cash-out reserves the
participant's requested amount and submits that amount directly from treasury
to the participant's persisted bank. Provider acceptance does
not become paid/settled until the selected terminal rule is observed.

## Slice plan

Each slice stops at its acceptance boundary. Later slices begin only after the
preceding result is reviewed.

| Slice | Deliverable | Acceptance boundary |
| --- | --- | --- |
| M1-S0 | Baseline and containment | Record live Sandbox treasury/participant wallet balances, current attached-bank state, exact test entity, and rendered UI baseline; no money movement; existing checks/build pass or baseline failures are documented |
| M1-S1 | Checkbook withdrawal discovery | Identify and read-only validate the Marketplace operation that can move wallet funds to an existing participant bank; document request fields, credential owner, rail selection, idempotency, status lookup, and whether recipient action is required |
| M1-S2 | Persisted payout destination | Attach or refresh one Plaid-authenticated bank under the selected participant; persist only Checkbook/Plaid references and masked metadata; restart the app and prove the method remains selectable without Link |
| M1-S3 | Just-in-time durable payout command | Add one idempotent Marketplace cash-out command that validates participant/method ownership, custom amount, rail, ISD entitlement, and treasury capacity; atomically creates/reuses an intent and reserves the custom amount; then pays directly from treasury to the participant's linked bank |
| M1-S4 | UI and lifecycle evidence | Add a Sandbox-labeled cash-out card, explicit amount/rail/review step, submit action, status refresh, and history containing source wallet, masked destination, provider IDs, requested/effective rail, and exact/normalized status |
| M1-S5 | End-to-end proof | Execute one small ACH payout, observe the strongest Sandbox terminal state available, restart, then execute a second payout using the same linked method without Plaid Link or recipient action; retries create no duplicate payment or ledger effect |
| M1-S6 | Failure and conclusion | Exercise insufficient entitlement/wallet funds, inactive or mismatched method, provider rejection, and ambiguous submission handling; publish a supported, constrained, or unsupported conclusion with evidence and remaining RTP questions |
| M1-S7 | CTO demo readiness | Provide a resettable Sandbox scenario and rehearse a short narrative showing one-time Plaid connection, persisted Checkbook destination, wallet funding context, silent repeat payout, status, and ledger trace without exposing secrets or relying on manual database edits |

## UI validation and CTO demonstration

The Marketplace page is the operator validation surface throughout the phase,
not a UI added only after the provider integration is complete.

The primary demonstration surface stays product-focused: participant overview,
one-time Plaid payout account, Marketplace cash-out, and transaction evidence.
Provisioning, wallet reconciliation, and ledger adjustment mechanics remain
available to the lab backend but are not presented as primary user steps.

### Validation progression

| Checkpoint | UI must prove |
| --- | --- |
| M1-S0 | Selected entity, ISD balance, treasury identity, participant wallet, persisted Plaid method, Checkbook attachment state, and Sandbox containment are visible |
| M1-S1 | Capability discovery has a visible supported, constrained, unsupported, or unknown result; discovery does not present a cash-out action prematurely |
| M1-S2 | Plaid method and Checkbook-attached bank are distinguished; masked attachment survives reload and restart; replace/remove behavior is explicit |
| M1-S3 | Submission prerequisites and blocking reasons are visible; the enabled command shows the exact treasury-to-linked-bank action and durable provider result |
| M1-S4 | Operator can review source wallet, masked destination, amount, rail, fee, and balances before submission, then see exact and normalized status |
| M1-S5 | Before/after wallet and ISD balances, provider reference, ledger trace, restart persistence, and idempotent replay are demonstrable in one flow |
| M1-S6 | Expected failures are visible, actionable, and do not resemble success or release ambiguous reservations |
| M1-S7 | A five-minute CTO walkthrough can be performed from a known Sandbox state with no terminal, database browser, or Checkbook dashboard required for the primary narrative |

### Provider-state freshness

- The UI must label cached provider balances with their last-refresh time.
- A GET-only **Refresh provider state** action must refresh treasury, participant
  wallet, and attached-bank state without provisioning, submitting, depositing,
  or moving funds.
- A stale or unavailable provider balance must not be displayed as a current
  zero balance and must block payout submission when capacity cannot be proven.
- Provider refresh and Sandbox mutation controls must be visually distinct.
- Acceptance screenshots or recordings must be taken only after a successful
  provider refresh and must include the Sandbox indicator.

### Demonstration narrative

1. Select Avery Owner and show ISD available-to-withdraw and treasury capacity.
2. Show the saved Plaid payout account and attach it to Avery's Marketplace
   identity once.
3. Refresh the app to prove the linked Checkbook destination persists.
4. Enter a small custom ACH cash-out and show the exact amount paid from the
   treasury wallet while the participant wallet remains at zero.
5. Submit and follow the Checkbook status without recipient interaction.
6. Show wallet, ISD ledger, masked destination, and immutable transaction trace.
7. Submit a second small payout using the same bank without reopening Plaid.

Provider IDs may be available as diagnostic detail, but the primary demo should
lead with actor, source, destination, amount, rail, status, and balance effects.

## Required behavior

### Submission safety

- Only allow Checkbook Sandbox hosts and credentials.
- Resolve participant, wallet, and attached bank ownership before reservation.
- Do not mirror or stage the user's ISD balance in the participant wallet; pay
  the exact custom amount directly from treasury.
- Validate treasury capacity for the custom cash-out amount before initiating
  the treasury-to-wallet leg.
- Use the persisted payment intent as the provider idempotency identity.
- A definitive pre-submission rejection releases the reservation.
- A timeout or otherwise ambiguous submission remains reserved and bound to
  Checkbook until status is resolved; never silently retry through another
  processor.
- Secrets, Plaid access/processor tokens, routing numbers, and account numbers
  never enter browser responses, logs, or ledger metadata.

### Lifecycle and ledger

- Retain exact Checkbook status alongside normalized status.
- Distinguish `submitted`, `processing`, `succeeded`, `failed`, `returned`, and
  `action_required` where provider evidence permits.
- Post the reserved amount to paid exactly once only at the documented terminal
  success point.
- Record fee entries separately if the Marketplace payout actually charges the
  configured ACH or RTP fee; do not infer fees from the UI percentage alone.
- Record later failure or return as new immutable entries rather than rewriting
  history.

### User experience

- Show the selected entity, spendable ISD balance, actual Checkbook wallet
  balance, amount, requested rail, source wallet, and masked destination before
  confirmation.
- Allow the linked account to be removed or replaced for future payouts without
  damaging historical records.
- Disable cash-out when the method, wallet, entitlement, or discovered provider
  capability is not ready and state the blocking reason.
- Keep Sandbox settlement controls visually separate from ordinary submit and
  status-refresh actions.

## End-to-end evidence record

For each acceptance payout retain or capture:

- demo entity and actor;
- ISD balances before and after;
- Checkbook wallet balance before and after;
- Plaid payment-method reference and masked account snapshot;
- Checkbook bank, wallet, payment/transfer, and request references;
- amount, fee, requested rail, and effective rail;
- timestamped exact provider statuses;
- whether any email, hosted page, or recipient action occurred;
- result after app restart and idempotent replay.

No API keys, secrets, access tokens, processor tokens, or full bank details may
appear in the evidence.

## Phase exit

Classify the result as one of:

- **Supported:** two treasury-to-linked-bank ACH payouts reach autodeposit from the UI,
  including one after restart, with no per-payout recipient interaction and
  correct idempotent ledger treatment.
- **Constrained:** direct payout works only for specific account, wallet, rail,
  onboarding, notification, or provider-configuration conditions; each
  constraint is explicit.
- **Unsupported:** Checkbook requires an email/hosted recipient deposit flow or
  exposes no usable treasury-to-persisted-bank operation. Preserve
  the provider response/documentation as the POC finding rather than emulating
  success locally.

RTP is a follow-on activation only after ACH proves the core silent-payout
contract. Production KYC/KYB, secrets, webhooks, treasury operations, limits,
returns, compliance, and reconciliation design remain outside this phase.
