# Payment Processor Router POC — Product Requirements

Status: Draft for product review · Last updated: 2026-07-29
Audience: Product, Design, Architecture, Engineering, Treasury, Finance, and Payment Operations

## 1. Purpose

Create one working payment flow that demonstrates a provider-neutral payment
experience over multiple payment processors. The flow will use Plaid Auth as
the primary bank-account connection entry point, allow an operator to select a
processor, execute debit and credit payments in Sandbox, observe settlement,
and retain complete payment details in the existing ISD ledger.

This document defines the POC product behavior and validation goals. It does not
select the final system architecture or claim production readiness.

## 2. Product outcome

The POC should answer four questions:

1. Can one clear user experience support bank connection, payment-method
   management, processor selection, payment execution, and settlement?
2. Can processor-specific behavior be presented through one understandable
   product contract without hiding meaningful differences?
3. Can each processor identify and use an explicit primary funding account for
   both debit and credit scenarios?
4. Can the existing ledger retain a provider-neutral payment record plus enough
   provider detail to reconcile and explain every outcome?

## 3. Scope

### In scope

- A new featured payment flow at the top of the main page.
- The three existing processor experiments retained below the new flow as
  supporting labs.
- Plaid Auth bank connection and payment-method management.
- Explicit operator selection of a supported payment processor.
- A visible payment processor router abstraction.
- Multiple processors implemented through the router contract.
- Sandbox execution and settlement of supported debit and credit payments.
- Processor-specific funding-account configuration and visibility.
- Provider-neutral payment intent, operation, status, and ledger history.
- Clear presentation of unsupported combinations and processor constraints.

### Out of scope for this POC

- Production funds or production provider credentials.
- Automatic least-cost or reliability-based processor selection.
- Automatic fallback after a payment has been submitted.
- Claims of final settlement semantics beyond what each Sandbox can establish.
- Final treasury, legal, compliance, KYC/KYB, fraud, limits, reserves, or
  commercial operating models.
- A production secret store, production authorization model, or production
  webhook operations platform.
- Making every processor support every direction or rail.

## 4. Product principles

1. **One flow, explicit differences.** The user gets one coherent flow, while
   provider-specific constraints remain visible.
2. **Plaid Auth owns bank connection.** Processor adapters consume an
   authorized payment-method reference; they do not redefine the primary bank
   connection experience.
3. **The user selects the processor.** The POC demonstrates routing through an
   explicit choice. Automated routing is a later capability.
4. **Direction is unambiguous.** Debit means moving funds from the target
   account toward the primary funding account. Credit means moving funds from
   the primary funding account toward the target account.
5. **Funding is explicit.** The interface identifies the source, destination,
   owner, and custodian of funds before submission.
6. **Acceptance is not settlement.** Provider acceptance, funds movement, funds
   availability, and settlement remain separate lifecycle observations.
7. **No ambiguous failover.** Once a provider may have accepted a request, the
   payment remains with that provider until its status is resolved.
8. **The ISD ledger is authoritative.** Provider ledgers, balances, and wallets
   are settlement mechanisms or manifestations, not separate entitlement
   systems.

## 5. Primary user

The primary POC user is an authenticated or locally trusted payment-lab
operator evaluating payment behavior on behalf of a demo owner-operator or
broker.

The operator must be able to:

- select the demo entity whose account and ledger are in context;
- manage that entity's Plaid-connected payment methods;
- understand the proposed movement of funds;
- select a processor that supports the requested payment;
- execute and settle a Sandbox payment;
- inspect both normalized and provider-specific results.

## 6. User capabilities and requirements

### 6.1 Discover the unified payment flow

**UR-01 — Featured placement**

The main page must present the new unified payment flow as the first and most
prominent working flow.

**UR-02 — Supporting experiments**

The three existing flows must remain available below the featured flow,
visually grouped as provider-specific experiments or reference implementations.

**UR-03 — Clear positioning**

The featured flow must explain that it demonstrates:

- Plaid-connected payment methods;
- explicit debit or credit direction;
- processor selection through a router;
- provider execution and settlement;
- unified ledger history.

**Acceptance**

- A user can distinguish the featured unified flow from the three supporting
  experiments without opening a detail page.
- All four flows remain reachable from the main page.
- The featured flow is labeled Sandbox/POC and does not imply production
  availability.

### 6.2 Select the payment context

**UR-04 — Demo entity selection**

The user must select a demo owner-operator or broker before managing payment
methods or initiating a payment.

**UR-05 — Persistent context**

The selected entity must remain visible throughout payment-method management,
payment composition, execution, settlement, and history review.

**UR-06 — Balance context**

The flow must show the selected entity's available, reserved, paid, and fee
balances from the existing ledger.

**Acceptance**

- A payment cannot be submitted without a valid entity.
- Changing entities refreshes payment methods, balances, and history and clears
  any unsafe in-progress payment state.

### 6.3 Manage payment methods through Plaid Auth

**UR-07 — Add**

The user must be able to add a bank payment method through Plaid Link and select
an eligible account.

**UR-08 — View**

The user must be able to view stored payment methods using masked account
details, institution, account name, type, status, and known capabilities.

**UR-09 — Update or replace**

The user must be able to update a bank connection when Plaid requires
reauthentication and replace the selected account when the desired account
changes. The POC may distinguish "repair connection" from "replace account."

**UR-10 — Remove**

The user must be able to remove a payment method from active POC use without
destroying historical payment and ledger references.

**UR-11 — Server-side credentials**

Plaid access tokens, processor tokens, and raw bank-account and routing numbers
must remain server-side. Browser responses must contain masked metadata only.

**Acceptance**

- Add, reload, replace/update, and remove behavior survives an application
  restart through existing SQLite persistence.
- A removed method cannot be used for a new payment.
- Historical payments remain intelligible after removal or replacement.
- The UI communicates whether a method can be used for debit, credit, or both.

### 6.4 Compose a payment

**UR-12 — Direction**

The user must explicitly choose one of:

| User choice | Normalized movement | Source | Destination |
| --- | --- | --- | --- |
| Debit target account | `external_debit` | Selected target bank account | Processor/platform primary funding account |
| Credit target account | `external_credit` | Processor/platform primary funding account | Selected target bank account or processor-supported recipient |

**UR-13 — Amount**

The user must enter a positive USD amount and see it in both dollars and ledger
minor units where diagnostic detail is useful.

**UR-14 — Target payment method**

The user must select an active payment method compatible with the requested
direction.

**UR-15 — Rail**

The user must select or confirm an available rail when the processor exposes
more than one. Requested and effective rails must remain distinct.

**UR-16 — Consent**

When a debit requires authorization or consent, the flow must display the
applicable authorization language and record affirmative acceptance, text
version, actor, and timestamp before submission.

**Acceptance**

- The review step identifies actor, source, destination, direction, amount,
  currency, payment method, processor, requested rail, and funding account.
- Unsupported direction, payment-method, processor, or rail combinations
  cannot be submitted.
- The product never uses ambiguous "send" or "receive" labels without also
  identifying the source and destination.

### 6.5 Select a payment processor

**UR-17 — Processor list**

The router must present each configured processor adapter and its current POC
availability.

**UR-18 — Explicit selection**

The user must explicitly select the processor for each payment. The router must
not silently replace that choice.

**UR-19 — Capability explanation**

For each processor, the flow must show:

- supported debit and credit directions;
- supported or known rails;
- required funding-account model;
- prerequisite state;
- whether execution and settlement simulation are available;
- any reason the processor cannot handle the current payment.

**UR-20 — Route preview**

Before confirmation, the flow must show the selected route as:

`source -> selected processor -> destination`

**UR-21 — No post-submission fallback**

If submission produces an ambiguous, accepted, or processing result, the
payment remains assigned to the selected processor. The user may not retry the
same economic payment through another processor until the first outcome is
resolved or explicitly canceled under a proven-safe rule.

**Acceptance**

- At least two processor adapters execute a real Sandbox payment through the
  shared router contract.
- All configured adapters can report their capabilities through the same
  product-facing model.
- Selecting a different processor changes the route and funding explanation
  without changing the core payment-composition experience.
- Unsupported adapters remain visible with a specific reason rather than
  disappearing or failing generically.

### 6.6 Understand the primary funding account

**UR-22 — Funding profile**

Each processor adapter must expose a funding profile for the selected direction.
The profile must identify:

- funding-account type;
- provider or custodian;
- account owner;
- stable masked or provider reference;
- balance or capacity when available;
- whether prefunding is required;
- whether the account is the source, destination, or intermediary;
- readiness or blocking condition.

**UR-23 — Direction-specific behavior**

The flow must explain how the funding account participates in a debit versus a
credit. The same provider may use different mechanics in each direction.

**UR-24 — Funding readiness**

The router must prevent submission when the selected processor's required
funding account is absent, unverified, disabled, or known to lack sufficient
capacity.

**UR-25 — Provider asymmetry**

The product must not pretend that unlike funding models are equivalent. Initial
POC expectations are:

| Processor path | Likely primary funding model | Required POC determination |
| --- | --- | --- |
| Plaid Transfer | Explicit Plaid Ledger | Confirm how debit proceeds enter and credits leave the Ledger; show available capacity |
| Checkbook Standard | Configured verified bank or prefunded wallet | Confirm direction support and whether debit and credit use the same funding source |
| Checkbook Marketplace | Treasury and participant wallets | Confirm wallet ownership, funding, internal manifestation, and external movement semantics |

**Acceptance**

- The user can identify the primary funding account before submission.
- A processor adapter cannot claim support until its funding model for that
  direction has been demonstrated.
- The payment record retains the funding-account reference used at submission.

### 6.7 Execute and settle a payment

**UR-26 — Confirmation**

The user must confirm the complete route and payment details before the first
provider-side action.

**UR-27 — Idempotent submission**

Each confirmed payment must have one durable payment intent and an idempotency
key that prevents duplicate provider submission.

**UR-28 — Observable execution**

The flow must show the normalized lifecycle and exact provider status
side-by-side.

**UR-29 — Settlement**

The POC must provide a Sandbox-supported way to advance or refresh a submitted
payment to a terminal state. Any simulation control must be clearly labeled and
must confirm provider state before changing the ledger.

**UR-30 — Ambiguous outcomes**

A timeout, lost response, or uncertain provider result must move the payment to
`action_required` or an equivalent reconciliation state. It must not
automatically release funds or initiate a different processor route.

**UR-31 — Failure and release**

Reserved funds may return to available only after the provider outcome is known
not to have moved funds, or after an explicit operator action backed by
reconciliation evidence.

**Acceptance**

- The POC demonstrates at least one successful debit and one successful credit
  across the available adapters.
- Repeating the same submission or settlement action does not duplicate the
  payment or ledger posting.
- The UI distinguishes provider acceptance from final settlement.
- Failed, canceled, returned, and ambiguous outcomes remain visible in history.

### 6.8 Review payment and ledger history

**UR-32 — Unified history**

The user must see payment history across all router adapters for the selected
entity.

**UR-33 — Payment details**

Each history entry must expose:

- payment intent ID;
- entity and actor;
- movement direction;
- amount and currency;
- source and destination references;
- payment-method snapshot;
- selected processor;
- requested and effective rail;
- primary funding-account reference;
- normalized lifecycle status;
- exact provider status and external transaction ID;
- idempotency key or safe diagnostic reference;
- created, submitted, updated, and settled timestamps where applicable.

**UR-34 — Ledger trace**

The user must be able to associate each payment with its ledger entries:

- reservation;
- settlement;
- release;
- return;
- fee;
- funding manifestation where applicable.

**UR-35 — Immutable history**

Changing or removing a payment method, processor configuration, or funding
account must not rewrite the historical snapshot used by a payment.

**Acceptance**

- A user can explain the full lifecycle and balance impact of any payment from
  the POC UI and persisted records.
- Provider-specific details are available without replacing normalized product
  meaning.
- Ledger totals remain internally balanced after success, failure, release, and
  repeated settlement attempts.

## 7. Underlying product capabilities

The user requirements imply the following product capabilities. Architecture
and design should assign clear ownership to each without changing their
product-visible contracts.

### PC-01 — Featured unified-flow experience

- Featured main-page placement.
- Entity, balance, and environment context.
- A guided sequence for method, direction, amount, processor, review,
  execution, settlement, and history.

### PC-02 — Bank connection and payment-method registry

- Plaid Link and token exchange.
- Durable entity-to-method association.
- Add, view, repair, replace, and remove lifecycle.
- Masked public representation and server-side credentials.
- Direction and rail capability metadata.

### PC-03 — Provider-neutral payment command

One normalized payment request containing:

- actor and entity;
- movement type;
- amount and currency;
- source and destination;
- payment method;
- selected processor;
- requested rail;
- funding-account reference;
- consent evidence when required;
- idempotency key.

### PC-04 — Processor registry and capability model

- Stable processor identity and display metadata.
- Direction, rail, funding, prerequisite, execution, and settlement
  capabilities.
- Available, unavailable, degraded, and unsupported states with reasons.
- Environment-specific configuration without browser exposure of secrets.

### PC-05 — Payment processor router

- Validate the normalized request.
- Validate the selected adapter's declared capabilities.
- Bind one intent to one selected processor before submission.
- Invoke the adapter through one straightforward contract.
- Return normalized results with retained provider detail.
- Refuse unsafe fallback or conflicting idempotent replay.

The initial router is an explicit dispatch capability, not an optimization
engine.

### PC-06 — Processor adapters

Each adapter must support a common conceptual pattern:

1. report capabilities and readiness;
2. describe the funding profile;
3. validate a payment request;
4. prepare or authorize the payment;
5. submit idempotently;
6. retrieve or synchronize status;
7. identify settlement, failure, cancellation, and return semantics;
8. provide sanitized provider evidence.

An adapter may declare a capability unsupported. It must not emulate a
different provider's semantics merely to satisfy the interface.

### PC-07 — Funding-account profiles

- Provider- and direction-specific funding configuration.
- Ownership, custody, masked reference, and readiness.
- Balance/capacity checks where supported.
- Snapshot of the funding account used by each payment.
- Reconciliation between ISD ledger expectations and provider balances or
  wallets.

### PC-08 — Payment lifecycle and provider operations

- Durable provider-neutral intent.
- One or more provider operations per intent.
- Exact provider identifiers, statuses, request IDs, and sanitized metadata.
- Normalized state transitions.
- Durable reconciliation state for ambiguous outcomes.
- Idempotent terminal processing.

### PC-09 — Canonical ledger integration

- Atomic reserve, settle, release, return, fee, and manifestation entries.
- Payment and provider-operation references.
- Historical payment-method and funding-account snapshots.
- Cross-processor entity balances and history.

### PC-10 — Sandbox operations and evidence

- Clearly labeled simulation or settlement controls.
- Provider state confirmation before ledger mutation.
- Evidence for submission, idempotency, status progression, and settlement.
- Diagnostic errors that preserve provider request references without exposing
  secrets.

## 8. Initial processor manifestations

The POC should manifest the abstraction using the existing provider work rather
than discarding it.

| Adapter | Minimum router manifestation |
| --- | --- |
| Plaid Transfer | ACH debit and credit where the linked account and Plaid Ledger support them; authorization, create, status, Sandbox settlement, and Ledger funding profile |
| Checkbook Standard | Digital-payment credit through the configured sender; expose debit as unsupported until a separately validated invoice/collection flow satisfies the normalized contract |
| Checkbook Marketplace | Wallet funding/internal movement and supported external movement; expose treasury and participant-wallet roles explicitly |

The requirement to demonstrate both debit and credit applies to the unified POC
as a whole. Each adapter must truthfully declare which directions it supports.

## 9. Normalized lifecycle

The POC should use a small product lifecycle while retaining exact provider
status separately:

`draft -> requires_method -> ready -> authorizing -> submitted -> processing -> succeeded`

Exceptional or terminal states:

- `action_required`
- `failed`
- `canceled`
- `returned`

Minimum transition rules:

- Provider acceptance may advance to `submitted` or `processing`, never directly
  to `succeeded` unless the provider's scenario-specific settlement contract is
  satisfied.
- Ambiguous submission remains `action_required` or `processing`; it does not
  release the reservation.
- `returned` is distinct from initial failure because funds may previously have
  been treated as settled or available.
- Every transition that changes ledger balances is atomic and idempotent.

## 10. POC quality and safety requirements

### QR-01 — Sandbox containment

- All processor adapters must reject production configuration.
- The UI must continuously identify the active environment.

### QR-02 — Trusted access boundary

- Payment execution, ledger adjustment, provider provisioning, settlement
  simulation, and credential registration must not be exposed to an anonymous
  remote user.

### QR-03 — Secret handling

- No provider secret, access token, processor token, raw account number, or raw
  routing number may appear in browser state, API responses, logs, or ledger
  metadata.

### QR-04 — Durability

- Payment methods, intents, operations, statuses, and ledger entries must
  survive application restarts.

### QR-05 — Testability

Automated tests must cover:

- router capability validation;
- adapter selection;
- debit and credit direction mapping;
- idempotent submission;
- insufficient ledger or provider funding;
- provider rejection;
- ambiguous response handling;
- settlement and repeated settlement;
- cancellation, return, and release rules;
- payment-method removal with preserved history;
- balanced ledger results.

### QR-06 — Explainability

- Every unavailable route and blocked submission must have a user-actionable
  reason.
- Every terminal payment must be traceable from product status to provider
  evidence and ledger entries.

## 11. POC completion criteria

The product POC is complete when:

1. The featured unified flow appears above the three existing experiments.
2. A demo entity can add, view, update/replace, and remove Plaid-connected
   payment methods.
3. The router lists all configured adapters and accurately describes their
   current capabilities and funding profiles.
4. The user can explicitly choose a supported processor.
5. At least two adapters execute payments through the router contract.
6. The POC completes at least one successful debit and one successful credit
   using real provider Sandbox operations.
7. Submitted payments can be synchronized or simulated to a provider-confirmed
   terminal state.
8. Ambiguous provider outcomes do not release funds or trigger cross-provider
   retry.
9. Every payment is represented by one durable intent, provider operations, and
   balanced ledger entries.
10. History explains the selected route, funding model, provider outcome, and
    ledger impact.
11. Automated tests demonstrate idempotency, settlement, failure, ambiguity,
    and restart durability.
12. The existing three experiments remain usable as comparison and diagnostic
    paths.

## 12. Open product decisions

These decisions must be resolved during design and architecture rather than
silently embedded in an adapter:

1. Is the "primary funding account" one ISD-owned economic account represented
   differently by each provider, or may each provider use a distinct settlement
   pool?
2. For Plaid Transfer debits, when are funds considered available in the Plaid
   Ledger for subsequent credits?
3. For Checkbook Standard, is the verified bank or a prefunded wallet the
   intended primary funding account, and which directions can it support?
4. For Checkbook Marketplace, are participant wallets required product
   balances or only provider-side manifestations of the ISD ledger?
5. Does "update payment method" mean Plaid Update Mode, selecting another
   account on the same Item, replacing the Item, or all three as distinct
   actions?
6. Which rails must the first unified flow expose beyond ACH?
7. Which exact provider events constitute POC settlement for each direction?
8. How should an operator resolve an ambiguous payment without enabling a
   duplicate economic payment?
9. Should the first router show unavailable processors for education, or only
   adapters configured in the current environment?
10. What minimum trusted-user boundary is required if the POC is accessible
    beyond localhost?

## 13. Design and architecture handoff

Design should define:

- featured-flow hierarchy on the main page;
- the guided flow and review experience;
- payment-method management states;
- processor comparison and unavailable-state presentation;
- funding-route visualization;
- execution, settlement, error, and reconciliation states;
- unified history and ledger trace.

Architecture should define:

- the normalized command and adapter contracts;
- processor and funding-profile registries;
- intent-to-processor binding and idempotency ownership;
- lifecycle synchronization and ambiguous-outcome recovery;
- ledger transaction boundaries;
- trusted access and secret-storage boundaries;
- test seams for deterministic provider behavior.

Both should preserve the central product promise: one understandable payment
flow with explicit processor choice and truthful provider-specific behavior.
