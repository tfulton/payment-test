# Money Movement Working Plan

Status: Working draft · Last updated: 2026-07-20

## Objective

Use the existing Plaid Auth and SQLite foundation to prototype, compare, and document three money-movement paths:

1. External account movement through Plaid Transfer.
2. External user movement through Checkbook's standard product.
3. Internal and external user movement through Checkbook Marketplaces.

The prototypes should establish the real flow of funds, rail eligibility, operational requirements, and user experience. They are not production payment infrastructure.

## Current implementation state

- Plaid Auth persists Sandbox Items and selected accounts in SQLite.
- Each demo entity automatically restores one active persisted payout method after reloads and app restarts; the UI supports safe replacement and confirmed local removal without deleting historical cash-out records.
- The selected entity's UI shows unified Plaid Transfer and Checkbook Standard cash-out history, including failed attempts, exact provider status/transaction IDs, and explicit Sandbox-only completion controls when available.
- A canonical immutable ISD ledger seeds four owner-operator/broker fixtures with $240,000 total earnings and now contains the historical Plaid Transfer and Checkbook Standard entries.
- Both completed flows implement the same cash-out use case: select a demo entity, link payout context through Plaid Auth, enter an amount, and reserve earnings before provider submission.
- Plaid Transfer ACH credit authorization/create is implemented at `/flows/plaid-transfer`; it pays from an explicit configured Plaid Ledger to the selected linked account.
- Checkbook Standard digital-check cash-out is implemented at `/flows/plaid-checkbook`; it pays from the configured sender's verified Sandbox funding bank to the selected entity's fixture email.
- Cash-out reservation is append-only and atomic: `available` decreases and `reserved` increases. Provider acceptance remains reserved until a terminal provider event establishes settlement or release. The Sandbox completion action confirms Plaid `settled` or Checkbook `PAID`, then atomically moves `reserved` to `paid` and marks the intent and cash-out succeeded.
- The explicit Plaid Sandbox Ledger was funded with a simulated $500,000 ACH deposit on 2026-07-20. Verified balance after posted, settled, and available simulation: $500,089.99 available and $0.03 pending.
- Terminal Sandbox status handling was validated on 2026-07-20: Plaid advanced `pending` to `posted` to `settled`, and Checkbook advanced `UNPAID` to `PAID`. Both provider confirmations posted their corresponding reserved earnings to paid, and repeat completion was locally idempotent.
- Provider rejection rollback and insufficient-balance protection were also validated: rejected submissions restore available earnings, while over-balance requests fail before the provider call.
- Each transfer persists one provider-neutral intent plus separate Plaid authorization and transfer operations, including provider request IDs and exact statuses.
- Checkbook Marketplace now provisions users, verified Plaid-authenticated banks, participant wallets, and an ISD treasury wallet. The proven on-demand cash-out pays directly from treasury to the onboarded participant's default linked bank; participant wallets remain available for other Marketplace experiments.
- The lab can adopt an existing Marketplace treasury user and discover its funded wallet. Its API key and secret are stored only in the ignored, mode-`0600` Sandbox SQLite database and are never returned by application APIs. Production must replace this local secret-store adapter with managed secret storage/KMS, auditable access, and rotation/revocation procedures.
- Marketplace cash-outs reserve the operator-entered amount and pay it directly from the ISD treasury to the participant's persisted bank. Existing wallet funding/reconciliation remains a lab capability but is no longer the target cash-out flow.
- The former experimental Marketplace-only ledger is retired from application reads and writes. Its one test adjustment remains in the legacy table for audit but was intentionally not imported into the canonical balance.
- One-time Sandbox ACH debit consent records its server timestamp and text version with the authorization operation.
- ACH debit and credit creation, retry idempotency, and process-durable records were validated in Sandbox on 2026-07-20. Both directions began in Plaid's expected `pending` status.
- Checkbook Support confirmed that Marketplace Sandbox autodeposit payments remain `IN_PROCESS` until the payment creator advances them with `PUT /v3/check/webhook/{check_id}`. The lab now exposes this as a distinct Sandbox-only action, reads the payment back as `PAID`, and only then settles the ISD reservation. Both live acceptance payouts completed this sequence on 2026-08-10.
- Production webhook/event synchronization, failed/canceled release handling, returns, and RTP capability checks remain future checkpoints.

## Demo cash-out model

| Entity | Type | Initial available earnings |
| --- | --- | ---: |
| `owner1` / Avery Owner | Owner-operator | $25,000 |
| `owner2` / Jordan Hauling LLC | Owner-operator | $40,000 |
| `broker1` / Morgan Broker | Broker | $75,000 |
| `broker2` / Summit Brokerage LLC | Broker | $100,000 |

SQLite is authoritative for each entity's earned, reserved, paid, and fee balances.
The Plaid Ledger is a central settlement pool. Checkbook participant wallets are
provider-side accounts for separate Marketplace use cases, not an independent
accounting source of truth or a full mirror of user earnings.

## Direction vocabulary

The cash-out UI uses a fixed payout direction. The API and database continue to
use unambiguous movement types:

| Movement type | Funds movement | Typical user-facing action |
| --- | --- | --- |
| `external_debit` | External bank account -> provider/platform balance | Receive or collect money |
| `external_credit` | Provider/platform balance -> external bank account | Send or pay out money |
| `internal_transfer` | One provider-held wallet -> another provider-held wallet | Send or receive internally |

Every payment intent must also identify the actor, counterparty, funding source, destination, requested rail, and effective rail. “Send” and “receive” alone are too ambiguous for provider APIs, reconciliation, and support.

## Capability assessment

| Product path | External ACH debit | External ACH credit | RTP | Internal movement | Primary constraint |
| --- | --- | --- | --- | --- | --- |
| Plaid Transfer | Yes | Yes | Credit/payout when the destination is eligible | No ordinary internal-wallet concept | Movement is between a linked account and the Plaid Ledger; user-to-user use cases may require Transfer for Platforms |
| Checkbook standard | Invoice/collection flow is documented for ACH | Digital check/payout flow is documented | Primarily an outbound deposit option; exact funding and API behavior require validation | No | Recipient-directed digital-check experience, not transparent direct-to-bank movement |
| Checkbook Marketplaces | External parties can push funds into a wallet | Marketplace can pay external recipients | Available for eligible, wallet-funded outbound payments; inbound is a bank-initiated push | Yes, wallet-to-wallet | Requires marketplace enablement, user onboarding, wallets, KYC/KYB, and credential custody |

### Important asymmetries

- Plaid Transfer is not a direct arbitrary bank-account-to-bank-account API. An external debit collects into Plaid's Ledger; an external credit pays from that Ledger. A user-to-user transaction is therefore at least two economic legs unless Plaid approves a platform-specific model.
- Plaid documents RTP as an instant payout network. An app-initiated RTP “debit” is not the mirror image of an RTP payout. Request for Payment is a separate capability and should not be assumed available.
- Checkbook standard payouts intentionally allow the recipient to choose where and how to deposit a digital check. The current ISD flow is consistent with that model; it does not prove ownership of a recipient bank account or provide a hidden direct-ACH recipient path.
- Checkbook Marketplace inbound ACH/RTP can be a push to a wallet's routing and account numbers. That is materially different from initiating a pull from the user's bank account.
- Checkbook internal wallet transfers are immediate ledger movements, not ACH or RTP, even when the surrounding product experience presents them alongside those rails.

## Proposed flows

### 1. Plaid Transfer: external account

#### Historical lab validation: receive or collect by ACH

1. User links and selects an account through Plaid Link with Transfer enabled.
2. Server creates an `external_debit` payment intent.
3. Server calls `/transfer/authorization/create` with an idempotency key.
4. After approval, server calls `/transfer/create`.
5. Webhook/event processing advances the intent through processing, settlement, failure, or return.

ACH debit authorization evidence must be presented and retained as required. If we do not use Plaid's Transfer UI, the prototype must explicitly capture the authorization text, timestamp, actor, and relevant payment details.

#### Implemented demo: cash out by ACH

1. User selects a fictitious entity and links its destination account.
2. Server atomically reserves the amount from that entity's available earnings.
3. Server creates an `external_credit` intent and authorizes it against the configured `PLAID_LEDGER_ID`.
4. Server creates an ACH credit from that Ledger to the linked account.
5. The accepted amount remains reserved until events determine settlement or release.

Credits require sufficient available Ledger balance. The Sandbox Ledger currently
has more than $500,000 available. RTP must be shown only when the selected account
is eligible; rail fallback must be explicit rather than silent.

#### Plaid decisions to validate

- Whether ISD's intended use is business-to-consumer movement or facilitation of user-to-user payments.
- Whether the use case requires Plaid Transfer for Platforms and whether that product is available to ISD.
- Whether the existing Auth-created Items can be upgraded or should be relinked with `transfer` in the Link token's products.
- Production approval, Ledger funding, reserves, limits, and return-handling requirements.
- Whether inbound instant payment is required and, if so, whether Request for Payment is available.

### 2. Checkbook standard: external user

#### Send or pay out

1. User completes the shared Plaid Auth flow; the Item and selected account are retained as payment-method context but are not attached to the standard Checkbook sender.
2. Server creates a Checkbook digital payment from the single configured ISD Checkbook account to the recipient's email.
3. Recipient opens the Checkbook experience and selects an eligible deposit method.
4. Checkbook webhooks report payment and deposit-option status changes.
5. Our payment intent records the provider status without claiming bank settlement prematurely.

This mirrors the previously observed ISD payout flow. The configured Checkbook account must have a verified funding bank or prefunded wallet. A Plaid account belonging to an arbitrary application user must not be attached using ISD's Checkbook credentials. ACH is the baseline; RTP availability and funding requirements remain separate validation work.

#### Receive or collect

The documented standard-product fit is a Checkbook invoice paid by ACH. This is a different UX from our Plaid-linked account pull and should remain a separately named scenario. Standard-product inbound RTP is not currently assumed.

#### Checkbook standard decisions to validate

- Which verified bank or wallet funds the configured ISD Checkbook sender in each environment.
- Whether outbound RTP can be funded directly from a linked bank account or requires a Checkbook wallet/prefund balance.
- Whether RTP is an API-selected rail or a recipient-selected deposit option for this account configuration.
- Whether Checkbook offers a standard-product inbound RTP flow appropriate for ISD.
- Exact webhook signature, retry, ordering, and terminal-status semantics.

### 3. Checkbook Marketplaces: internal and external user

#### Marketplace setup

1. Enable the Marketplace product in a dedicated Sandbox account.
2. Create marketplace users and complete required KYC/KYB onboarding.
3. Create wallets for the owner and/or users.
4. Store per-user Checkbook credentials encrypted and server-side only.
5. Arrange Sandbox wallet funding with Checkbook where required.

#### Internal movement

The existing funding command proves an idempotent treasury-to-participant wallet
transfer, but the live cash-out proof showed that staging is unnecessary. The
target path reserves the custom amount and pays it directly from treasury to the
onboarded participant's linked bank.

No provider call occurs when the ISD entitlement or treasury capacity is
insufficient. Any unexpected participant-wallet residual becomes a
reconciliation exception; it must not be treated as additional user earnings.

#### External outbound movement

For each payout, reserve the custom amount and create the Marketplace payment
directly from the ISD treasury to the participant's persisted bank. Test ACH
first, then RTP with an eligible
destination. Record whether the recipient experience remains silent.

The focused implementation and evidence plan is defined in
[Phase M1 — Plaid Auth + Checkbook Marketplace Silent Payout](architecture/phases/m1-checkbook-marketplace-silent-payout.md).

#### External inbound movement

Expose the receiving wallet's routing and account details in a controlled test flow. The external party initiates an ACH, RTP, FedNow, or wire push from its financial institution. Treat this as a bank-initiated wallet funding flow, not as an API debit.

#### Marketplace decisions to validate

- Product enablement, commercial approval, enhanced-wallet availability, and production limits.
- Which participant owns each wallet and which party is merchant-of-record or funds-flow principal.
- Required user types, KYC/KYB steps, and restricted states.
- Per-user API credential issuance, storage, rotation, and revocation.
- Permitted owner-to-user, user-to-user, and user-to-external flows.
- RTP funding, eligibility, limits, fallback behavior, and return/error semantics.

## Shared server model

The next persistence layer should be provider-neutral at the intent level and provider-specific at the operation/event level.

### `payment_intents`

- `id`
- `actor_user_id`
- `movement_type`: `external_debit`, `external_credit`, or `internal_transfer`
- `counterparty_type` and `counterparty_ref`
- `amount_minor` and `currency`
- `provider_path`: `plaid_transfer`, `checkbook_standard`, or `checkbook_marketplace`
- `requested_network` and `effective_network`
- `payment_method_id` or `wallet_id`
- `status`
- `idempotency_key`
- `created_at` and `updated_at`

### `provider_operations`

One intent may produce multiple provider operations, such as authorization plus transfer, invoice plus payment, or debit leg plus credit leg.

- `payment_intent_id`
- `provider`
- `operation_type`
- `external_id`
- `provider_status`
- sanitized provider metadata
- timestamps

### `payment_events`

- unique provider event ID
- provider and event type
- related intent and operation IDs when resolved
- sanitized payload
- received and processed timestamps
- processing result or error

Webhook ingestion must be durable, deduplicated, replayable, and tolerant of out-of-order events.

### Checkbook Marketplace entities

Add `marketplace_users` and `wallets` only when that slice begins. Provider credentials are secrets, not ordinary entity attributes, and need an encrypted secret-storage boundary before any production use.

## Common lifecycle

Use a small normalized lifecycle for product UI and retain the exact provider status separately:

`draft -> requires_method -> ready -> authorizing -> submitted -> processing -> succeeded`

Terminal or exceptional states:

- `failed`
- `returned`
- `canceled`
- `action_required`

“Submitted,” “paid,” and “sent” must not be translated to `succeeded` unless the provider event actually establishes the completion semantics required by that scenario.

## Recommended implementation sequence

### Checkpoint 0: product and funds-flow decisions

- Draw the legal and operational flow of funds for all three paths.
- Decide whether “external user” means a user-controlled linked account, an email/phone recipient, or an onboarded marketplace participant.
- Confirm which entity funds payouts and bears ACH return, fraud, and negative-balance risk.
- Obtain Plaid Transfer and Checkbook Marketplace Sandbox enablement.
- Resolve the provider questions above before promising a unified UX.

### Checkpoint 1: shared movement infrastructure

- Add the three SQLite tables and normalized lifecycle.
- Add idempotent command handling and webhook event ingestion.
- Extend the UI to capture amount, counterparty, movement type, and requested rail.
- Keep provider credentials and Plaid access tokens server-side.

### Checkpoint 2: Plaid Transfer ACH

- Add Transfer-aware Link initialization.
- Implement ACH debit authorization and creation.
- Implement ACH credit creation from a funded Sandbox Ledger.
- Exercise success, failure, cancellation, return, duplicate request, and process-restart cases.

### Checkpoint 3: Plaid RTP payout

- Add account capability lookup.
- Offer RTP only for eligible accounts.
- Verify Ledger balance behavior and explicit ACH fallback.

### Checkpoint 4: Checkbook standard

- Reproduce outbound digital payment from the configured Checkbook sender to an email recipient first.
- Keep the user's shared Plaid payment method independent from the sender's Checkbook funding source.
- Add inbound ACH invoice as its own scenario.
- Add RTP only after the account-specific funding and recipient behavior is verified.

### Checkpoint 5: Checkbook Marketplaces

- Implement user onboarding and wallet creation.
- Implement internal wallet transfer.
- Implement external ACH payout, then eligible RTP payout.
- Demonstrate external push funding separately from application-initiated collection.

## Evidence required at each checkpoint

- Exact source, destination, owner, and custodian of funds at every step.
- Provider request IDs, idempotency behavior, and sanitized API evidence.
- Durable webhook/event history with duplicate and out-of-order handling.
- Success, failure, return, cancellation, timeout, and retry behavior.
- Persistence across application restarts.
- Explicit requested-versus-effective rail and fallback behavior.
- No provider secret, Plaid access token, bank credential, or raw account number in browser payloads or logs.
- A recorded distinction between provider acceptance, funds sent, funds available, and final settlement.

## Reference documentation

- [Plaid Transfer overview](https://plaid.com/docs/transfer/)
- [Plaid Transfer creation flow](https://plaid.com/docs/transfer/creating-transfers/)
- [Plaid Transfer for Platforms](https://plaid.com/docs/transfer/platform-payments/)
- [Plaid Transfer API](https://plaid.com/docs/api/products/transfer/initiating-transfers/)
- [Plaid Sandbox Transfer and Ledger simulation](https://plaid.com/docs/transfer/sandbox/)
- [Checkbook standard payouts](https://docs.checkbook.io/docs/products/payments/payouts/)
- [Checkbook invoices](https://docs.checkbook.io/docs/products/invoices/)
- [Checkbook funds flow](https://docs.checkbook.io/docs/concepts/flows/)
- [Checkbook RTP](https://docs.checkbook.io/docs/rails/us/rtp/)
- [Checkbook Marketplace overview](https://docs.checkbook.io/docs/products/marketplace/)
- [Checkbook Marketplace payments guide](https://docs.checkbook.io/guides/marketplace/payments/)
- [Checkbook webhooks](https://docs.checkbook.io/docs/api/webhooks/)

## Working decisions log

| Date | Decision | Status |
| --- | --- | --- |
| 2026-07-17 | Use `external_debit`, `external_credit`, and `internal_transfer` as canonical API movement types. | Proposed |
| 2026-07-17 | Treat RTP as a capability-gated path, not a symmetric replacement for ACH. | Proposed |
| 2026-07-17 | Build shared intent, operation, and event persistence before provider-specific money movement. | Proposed |
| 2026-07-17 | Start Checkbook Marketplace testing with internal wallet transfer. | Proposed |
| 2026-07-20 | For the standard Checkbook path, retain Plaid Auth as shared payment-method context and send from one configured Checkbook account; do not attach arbitrary user banks to that account. | Accepted |
| 2026-07-20 | Implement Plaid Transfer as ACH-first: UI `send` creates an external-account debit into the Plaid Ledger; UI `receive` creates a Ledger-funded external-account credit. | Accepted |
| 2026-07-20 | Use WEB for interactive personal ACH debits, PPD for personal ACH credits, and CCD for business transfers; retain explicit account-holder type in the request boundary. | Accepted for Sandbox prototype |
| 2026-07-20 | Keep RTP out of the first Transfer slice until `/transfer/capabilities/get` gates eligible credit destinations. | Accepted |
| 2026-07-20 | Use one SQLite application ledger for owner-operator/broker earnings across all providers; provider balances are settlement pools only. | Accepted |
| 2026-07-20 | Replace provider-specific balance reads/writes with one canonical immutable ISD ledger; migrate existing Standard/Plaid history with payment-method and provider-operation snapshots. | Implemented |
| 2026-07-20 | Mirror `available + reserved` into participant Checkbook wallets, record wallet funding as a ledger manifestation, and surface actual-minus-expected variance for cross-flow reconciliation. | Implemented experiment; superseded for Marketplace cash-out |
| 2026-08-07 | Pay the custom cash-out amount directly from the Marketplace treasury to the onboarded participant's linked bank; do not mirror or stage ISD earnings in participant wallets. | Proven in M1-S5; supersedes the earlier staging hypothesis |
| 2026-07-21 | Use a dedicated Marketplace master user as the ISD wallet-funding identity; keep its Sandbox credentials in the local SQLite secret-store adapter and require a managed vault in production. | Implemented for lab |
| 2026-07-20 | Seed `owner1`, `owner2`, `broker1`, and `broker2` with $240,000 total earnings and use the same cash-out UX for Plaid Transfer and Checkbook Standard. | Implemented |
| 2026-07-20 | Require an explicit `PLAID_LEDGER_ID`; fund that Sandbox Ledger with a simulated $500,000 deposit for demo capacity. | Implemented |
| 2026-07-20 | Expose Sandbox-only completion controls that confirm Plaid `settled` or Checkbook `PAID` before atomically posting reserved earnings to paid. | Implemented |
