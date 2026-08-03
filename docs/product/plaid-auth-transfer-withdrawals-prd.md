# Plaid Auth + Transfer Withdrawals — Product Requirements

Status: Draft for cross-functional review

Last updated: 2026-08-03

Product decision: Plaid Auth + Plaid Transfer approved
Target product: ISD `react-app`

## 1. Summary

ISD will add Plaid Auth and Plaid Transfer as a new withdrawal processor path.
Users will launch Plaid's bank-connection experience from ISD, then manage the
resulting tokenized payment method and cash out eligible earnings through Plaid
Transfer.

The feature will also establish durable product abstractions for payment
methods and payment processor routing. Plaid Transfer will be added through
those boundaries rather than as another hard-coded withdrawal path. Existing
Checkbook behavior will adopt the same abstractions where doing so is safe and
useful, without rewriting in-flight withdrawals.

The work should improve bank setup and repeat withdrawals without replacing the
product concepts users already understand: available balance, MFA, withdrawal
amount, transfer speed, fees, status, and withdrawal history.

The release will be feature-flagged, introduced in cohorts, and designed so
existing Checkbook withdrawals can continue while users migrate. Finance and
ISD Support Operations must participate in funding, reconciliation, reporting,
training, and launch readiness before customer rollout.

## 2. Product decision and context

Today, the `react-app` cash-out flow:

1. shows the company's available balance;
2. requires phone-based MFA;
3. collects amount and Standard or Instant transfer preference;
4. creates a `Withdrawal` record;
5. invokes backend `initTransfer` processing;
6. sends a Checkbook digital check from the configured ISD Checkbook account to
   the user's name and email;
7. uses provider status updates to update withdrawal history, company balance,
   and associated task values.

Relevant current paths include:

- `src/containers/Withdrawal/CashOutContainer.js`
- `src/components/Withdrawal/CashOutComponent.js`
- `src/containers/Earnings/EarningsListContainer.js`
- `src/containers/UserAccount/BankAccountsContainer.js`
- `src/utils/firebase/db/Withdrawals.js`
- `src/utils/firebase/db/PaymentAccount.js`
- `functions/src/withdrawals.es`
- `functions/src/checkbookio/checkbookio.js`
- `functions/src/checkbookio/checkbookioWebhook.js`

Prior Plaid discovery lives on the `react-app`
`feature/ISD-4845-plaid-auth` branch under `docs/ISD-4845-PLAID/`. That work
assumed Plaid Auth would continue feeding Checkbook. This PRD supersedes that
processor assumption: the approved target is Plaid Auth plus Plaid Transfer. It
retains and expands the earlier provider-aware payment-method direction.

### Mandatory financial-data boundary

ISD must never request, receive, process, log, cache, or persist user bank login
credentials, full account numbers, or routing numbers, including during
transient server-side processing. Bank authentication and sensitive bank-account
details remain within Plaid-controlled systems and user interfaces.

ISD integrations use only provider-issued opaque tokens and references required
for authorized operations, plus safe display metadata such as institution,
account type, and mask. ISD must not call or configure provider interfaces that
return raw bank details. Provider API credentials and opaque operational tokens
are secrets: they remain outside browser-readable data and are stored only in
approved secrets or token storage with least-privilege access.

### Nacha authorization and Proof of Authorization

ISD must comply with applicable Nacha authorization and Proof of Authorization
(POA) requirements for every ACH transaction type and Standard Entry Class
(SEC) code used by the product. ISD owns and maintains the authorization policy,
lifecycle, and provider-neutral POA record across processors. That record must
evidence the user's authorization while identifying the bank account through a
tokenized payment-method reference and safe display information, never full
account or routing numbers.

Plaid guidance specifically calls out POA collection for ACH debits. Because
ISD's initial withdrawal use case sends ACH credits, Legal/Compliance and Plaid
must confirm the authorization and evidence requirements for each approved
transaction direction and SEC code; no flow may launch based on an assumption
that POA is inapplicable.

For each transaction requiring POA:

- authorization must be captured before transfer submission using the correct
  transaction direction, amount or authorized terms, and SEC code;
- ISD maintains a canonical authorization-evidence record containing the user,
  canonical and tokenized payment-method references, transaction scope,
  direction, SEC code, terms version, consent timestamp, status, processor,
  evidence source, and opaque POA reference;
- the record includes a reproducible copy of the authorization terms and the
  audit trail linking the authenticated user, tokenized payment method, and
  affirmative consent, without raw bank details;
- a provider may retain supplemental provider-native evidence or the secure
  token-to-account association when required by its operating model;
- authorized ISD operators must be able to produce the ISD POA record and obtain
  any required supplemental provider evidence for an audit, dispute, or Nacha
  request; and
- revoked, expired, missing, or nonconforming authorization blocks submission
  and cannot be bypassed through another processor.

Nacha's public WEB guidance includes account and routing numbers among suggested
authorization content, but also illustrates identifying a previously retained
account as the **bank account on record**. This PRD does not assume that ISD must
store raw account or routing details in its POA. Legal/Compliance, Plaid, and
ISD's ODFI must confirm that the tokenized payment-method reference and available
provider evidence satisfy the current rules and origination agreement.

Processor portability does not imply that one provider's POA can automatically
authorize another provider. Before routing through a different processor, its
adapter must confirm that the existing authorization is legally and
operationally reusable; otherwise, the user must complete a new authorization.
If an authorization flow cannot satisfy the applicable POA requirement while
preserving ISD's token-only financial-data boundary, that flow cannot launch.
[Plaid documents](https://plaid.com/docs/transfer/creating-transfers/) that
customers not using Transfer UI must collect and retain their own POA for at
least two years; [Plaid Transfer UI](https://plaid.com/docs/transfer/using-transfer-ui/)
can capture and manage POA for Nacha WEB authorization. Product, Finance,
Legal/Compliance, Engineering, and Plaid must confirm the applicable SEC codes
and final evidence model before pilot, using
[Nacha's WEB POA industry practices](https://www.nacha.org/system/files/2022-11/WEB_Proof_of_Authorization_Industry_Practices.pdf)
and the current Nacha Operating Rules as governing references.

### Human review of AI-assisted implementation

Any code, configuration, data migration, test, or operational artifact created
wholly or partly with generative AI is an untrusted draft until reviewed and
approved by qualified ISD engineers. Human review must verify correctness,
security, financial integrity, data-handling boundaries, idempotency, failure
behavior, auditability, and consistency with approved requirements. AI output
alone cannot satisfy a design, code-review, testing, security, or release gate.

The responsible human reviewers and their approvals must be recorded through
ISD's normal pull-request and change-management process. AI-assisted changes
must not reach the pilot or production environment without this review and the
same test evidence required for human-authored changes.

## 3. Goals

- Let users connect, view, repair, replace, and remove withdrawal bank accounts
  from inside ISD using Plaid Auth.
- Enforce a token-only integration boundary so user bank credentials and full
  account/routing details never enter ISD systems.
- Execute eligible withdrawals through Plaid Transfer.
- Introduce a provider-neutral payment-method model that distinguishes bank
  connection from processor-specific withdrawal eligibility.
- Maintain a provider-neutral POA record in ISD, supplemented by provider-held
  evidence when required, without storing raw bank details.
- Introduce a payment processor routing boundary that selects and invokes a
  supported processor through a consistent product lifecycle.
- Bring newly initiated legacy Checkbook withdrawals through the shared
  abstractions when practical, while preserving historical and in-flight
  behavior.
- Preserve the recognizable ISD cash-out experience and existing financial
  rules unless a separately approved change is required.
- Support both new users and a controlled migration of existing users.
- Keep historical and in-flight Checkbook withdrawals intact.
- Introduce the new path behind the existing ISD feature-flag apparatus.
- Give Finance and ISD Support Operations the information, training, and
  operating procedures needed to support launch.
- Provide reliable withdrawal status, reconciliation, and reporting across both
  processors during migration.

## 4. Non-goals

- Redesign earnings calculation, withdrawal limits, hold rules, or fee policy.
- Add inbound payments or debit users' bank accounts.
- Automatically select the cheapest processor.
- Automatically retry an uncertain Plaid withdrawal through Checkbook.
- Build a universal payments platform for every ISD money-movement use case.
- Require broad modernization of the existing Checkbook implementation before
  the Plaid pilot. Legacy integration should be adapted incrementally where a
  safe compatibility boundary can preserve behavior.
- Force all existing users to migrate in the initial release.
- Remove Checkbook or its historical data as part of this launch.
- Treat Plaid account verification alone as proof that every account and rail is
  eligible for Transfer.
- The initial release is limited to ACH. RTP/Instant Transfer requires separate
  validation and approval of eligibility, economics, funding, and operational
  behavior for ISD.

## 5. Users and jobs

### New withdrawal user

For this user, the **Earnings experience** means the enhanced Earnings page
demonstrated by the Plaid Auth prototype in `react-app`. The prototype adds a
Withdrawal method panel above the existing balance and Cash Out controls. That
panel explains whether setup is missing, in progress, ready, or needs attention
and provides the next action. It keeps bank setup, withdrawal readiness, cash
out, and recent withdrawal activity in one ISD workflow rather than sending the
user to a separate bank-account screen or processor-managed setup.

Needs to:

- understand from the Withdrawal method panel that an eligible bank account is
  required before Cash Out becomes available;
- launch Plaid Link from that panel and securely select a bank account;
- return from Plaid Link to the same page and see setup progress, readiness, or
  a clear recovery action;
- repair or replace a connection and remove a method when permitted;
- confirm the destination, amount, timing, and fees before submitting; and
- complete and track a first withdrawal in the same unified history used for
  future withdrawals, alongside the existing balance and Latest Withdrawals
  views.

### Existing withdrawal user

An existing user may have Checkbook withdrawals that are already submitted or
in flight. Those withdrawals continue through Checkbook to their terminal
outcome and remain visible in history. Enrollment in the new Plaid experience
is a clean cutover for future activity: once the feature is presented to that
user, bank setup and all new withdrawals use the Plaid Auth + Transfer stack.
The old Checkbook method is not offered as a parallel choice or fallback.

Needs to:

- understand that ISD has replaced the prior setup and initiation experience
  for future withdrawals;
- connect and validate a Plaid-backed method before initiating the next cash
  out;
- see previously submitted Checkbook withdrawals complete without interruption;
- explicitly know which Plaid-linked method will receive the next withdrawal;
- repair, replace, or remove a method when permitted; and
- retain one history across completed, in-flight, and new withdrawals without
  encountering competing processor experiences.

### Finance operator

Needs to:

- understand the approved funding model and keep the Plaid Ledger sufficiently
  funded;
- reconcile ISD withdrawals to processor, Ledger, and bank activity;
- identify returns, exceptions, timing differences, and unresolved items; and
- produce consistent accounting and management reporting across processors.

### ISD Support Operations

Needs to:

- identify the user's active method, processor path, and rollout cohort;
- use safe display metadata and opaque provider references to determine the
  destination, owning processor, current stage, and whether a withdrawal has
  failed or been returned;
- give the user a specific next action without access to raw bank details;
  and
- escalate to Product, Engineering, Finance, or Plaid with the required
  references and event history.

## 6. User experience requirements

The Plaid Auth prototype in `react-app` establishes the starting point: the
Earnings page combines withdrawal-method management, balance and Cash Out, and
withdrawal history. The prototype will be updated to represent the approved
Plaid Auth + Transfer model end to end. Detailed layout, interaction, and copy
will be resolved through that prototype work.

### 6.1 Earnings workspace

**PR-01 — One withdrawal experience**

Users manage payment methods, initiate Cash Out, and review withdrawal history
through one coherent Earnings experience. After cutover, the experience does
not expose Checkbook as an alternate method or processor for new withdrawals.

**PR-02 — Clear state and next action**

The experience communicates whether the user can cash out and, when they
cannot, the single most relevant next action. Status language must distinguish
setup, submission, processing, completion, failure, and return without exposing
provider implementation details unnecessarily.

### 6.2 Payment-method management

**PR-03 — Add and identify methods**

Users can connect an eligible bank through Plaid Link and identify the active
method using safe details such as institution, account name/type, and mask.
Plaid handles bank authentication and sensitive bank-account details. ISD
receives and retains only opaque provider tokens/references and safe display
metadata; raw bank credentials and full account/routing details never enter ISD
systems.

**PR-04 — Modify and remove methods**

Users can repair or reauthorize a connection, add or select a replacement, and
remove a method when permitted. The UX must prevent changes that would create
an unsafe dependency or obscure an in-flight withdrawal, and method changes
must not rewrite history.

### 6.3 Cash Out

**PR-05 — Readiness and confirmation**

Cash Out is available only when the active method and requested transfer are
eligible. Before submission, the user can confirm the destination, amount,
fees, expected timing, and available transfer option. ACH is the initial option;
faster rails appear only when approved and supported. When Nacha authorization
is required, the user completes the explicit authorization before submission.

**PR-06 — Explicit authorization acknowledgment**

When POA is required, the final confirmation presents concise, readily
identifiable authorization language with an unchecked checkbox or equivalent
affirmative control. Cash Out remains disabled until the user assents. The UX
shows the amount or authorized scope, transaction direction, date or frequency,
tokenized/masked payment method, and revocation terms when applicable; detailed
terms may be linked but the authorization must not be hidden inside general
terms and conditions.

ISD records the authenticated user, affirmative action, timestamp, displayed
terms version, transaction, tokenized payment method, and resulting POA/provider
reference without raw bank details.

**PR-07 — Reliable submission behavior**

Each withdrawal remains bound to the processor assigned by the router and the
payment method used at submission. An uncertain Plaid result must be resolved
through Plaid rather than resubmitted through Checkbook.

### 6.4 History and support

**PR-08 — Unified history**

Latest Withdrawals and the transactions report remain the single history for
completed, in-flight, failed, and returned withdrawals across the cutover.

**PR-09 — Actionable support detail**

Support can see the masked destination, owning processor, provider reference,
current stage, event history, and actionable failure or return reason without
access to raw bank details.

### 6.5 Enabling product capabilities

**PR-10 — Payment-method abstraction**

ISD maintains a canonical payment-method identity and safe common view while
preserving opaque provider references, readiness, capabilities, and errors. The
abstraction must not contain raw bank details. Legacy Checkbook records remain
available for history and operations without being represented as Plaid
methods.

**PR-11 — Payment processor routing**

New withdrawals enter a common routing boundary that applies explicit rollout,
method-readiness, rail, and processor-availability policy. The router binds the
withdrawal before submission and records the chosen processor and reason.

**PR-12 — Provider adapters and lifecycle**

Plaid Transfer and the approved legacy Checkbook path participate through
provider adapters or compatibility boundaries. ISD exposes a consistent
withdrawal lifecycle while preserving exact provider behavior needed for
authorization/POA, operations, reconciliation, and support. Each adapter must
declare how authorization is captured, returned to the canonical ISD record,
supplemented, retrieved, revoked, and validated for reuse.

## 7. Existing-user migration

### Recommended migration experience

Existing users should receive a simple, in-product invitation such as:

> New and improved withdrawals: securely connect your bank in ISD for a faster,
> more direct cash-out experience.

For an enrolled user, this message marks a product cutover rather than an offer
to choose between two withdrawal experiences. The migration sequence should
be:

1. Before cohort enrollment, retain the user's existing Checkbook experience.
2. At enrollment, replace Checkbook setup and new-withdrawal initiation with the
   Plaid experience.
3. Require the user to connect and activate an eligible Plaid-backed method
   before the next Cash Out.
4. Show the destination clearly before the first Plaid withdrawal; do not offer
   Checkbook as an alternate processor.
5. Route every new withdrawal for that enrolled user through the approved Plaid
   Transfer policy.
6. Continue every previously submitted Checkbook withdrawal through Checkbook
   without interruption or rerouting.
7. Preserve one user-visible history across both processors.

### Migration rules

- Do not silently match a legacy Checkbook account to a Plaid account.
- Do not infer ownership or eligibility from matching institution, account
  type, or mask.
- Preserve the legacy Checkbook method record for history and operations, but
  do not expose it as an active option after user cutover.
- A failed or abandoned Plaid connection leaves the user in a recoverable Plaid
  setup state; it must not fall back to new Checkbook initiation.
- An in-flight withdrawal remains with the processor that accepted it.
- Migrating a user changes the UX and routing for all future withdrawals; it
  does not rewrite or interrupt prior withdrawals.
- Pausing Plaid initiation affects new submissions only; existing Plaid and
  Checkbook withdrawals continue status processing, returns, reconciliation,
  and support.
- Any future mandatory migration or Checkbook retirement requires a separate
  product decision based on adoption and operating evidence.

### Migration cohorts

Recommended rollout order:

1. internal ISD users and test companies;
2. new withdrawal users in a limited production cohort;
3. invited existing users with no in-flight withdrawal;
4. existing users with in-flight withdrawals, once cross-processor history and
   support visibility are verified;
5. default Plaid path for eligible users;
6. any mandatory migration only after separate approval.

## 8. Feature flag and rollout controls

The feature should use the current `react-app` apparatus in
`src/utils/features.js`, which supports `features__*` fields and user/company
gating.

Proposed flag name: `plaidTransferWithdrawals`

Proposed field: `features__plaidTransferWithdrawals`

This flag controls cohort enrollment, not day-to-day provider health. A separate
backend-controlled operational state should pause Plaid initiation during an
incident without changing who has already crossed the cutover boundary.

Final placement on user, company, or both should follow the ownership model for
withdrawals and pilot enrollment. Product requirements are:

- flag off for a user not yet enrolled: the existing Checkbook experience and
  processing remain unchanged;
- flag on: the user is cut over to Plaid bank setup and Plaid Transfer for all
  new withdrawals; Checkbook is not offered as an initiation fallback;
- later cohort-flag changes do not silently move a cut-over user back to the
  Checkbook experience;
- operational pause: keep Earnings, the linked method, and history available,
  but disable new Cash Out submission with a clear temporary-unavailability
  message and Support path; do not require the user to relink;
- frontend and backend both enforce rollout eligibility;
- routing policy is evaluated on the trusted backend before provider
  submission;
- the selected processor and routing reason are persisted on each withdrawal;
- flag changes cannot reroute an existing withdrawal;
- rollout can be paused without disabling Plaid status processing;
- cohort membership is reportable for adoption and incident analysis.

The system must retain whether a user has crossed the cutover boundary so a
later flag change cannot create a mixed experience. The flag controls cohort
eligibility and rollout policy; it must not become a second hard-coded processor
switch outside the router.

## 9. Finance and ISD Support Operations readiness

Product owns cross-functional readiness coordination. Product does not need to
design Finance or Support procedures alone, but launch cannot proceed until the
responsible teams agree on the minimum operating model.

### Required working sessions

Product will convene Finance, Legal/Compliance, ISD Support Operations,
Engineering, and Plaid to resolve:

- Plaid Ledger ownership and authorized operators;
- initial funding method and amount;
- ongoing funding cadence and minimum-balance thresholds;
- limits, reserves, settlement timing, and return exposure;
- daily reconciliation inputs and owner;
- accounting/reporting fields and delivery cadence;
- applicable Nacha SEC codes, canonical ISD POA content, retention,
  retrieval/export, supplemental provider evidence, revocation, processor
  portability, dispute response, and accountable owner;
- return, failure, duplicate, and insufficient-funds handling;
- customer-support states, scripts, permissions, and escalation path;
- incident ownership and feature-flag rollback authority.

### Plaid training

Use ISD's highest-tier Plaid support relationship to arrange role-specific
training before pilot:

- Product/Engineering: Transfer lifecycle, capabilities, idempotency, webhooks,
  returns, and Sandbox/production differences.
- Legal/Compliance: applicable SEC codes, authorization terms, POA evidence,
  retention, retrieval, revocation, and dispute obligations.
- Finance: Ledger funding, settlement, reconciliation, reporting, reserves, and
  limits.
- ISD Support Operations: account-linking failures, Transfer status, safe user
  guidance, and escalation evidence.

Training decisions and reference material should be retained in an internal
runbook accessible to the operating teams.

### Minimum operational outputs

Before customer pilot, the group must produce:

- named owners and escalation contacts;
- documented Ledger funding and balance-monitoring procedure;
- documented Nacha authorization/POA operating and retrieval procedure;
- daily reconciliation report or repeatable process;
- withdrawal exception and return queue/report;
- Support status guide and user-facing troubleshooting copy;
- provider escalation template containing safe identifiers;
- go/no-go and rollback checklist.

## 10. Reporting and measurement

### Product metrics

- Plaid Link start and completion rate.
- Account-ready rate and top failure reasons.
- Existing-user migration invitation and completion rate.
- Withdrawal submission success rate by processor and rail.
- Time from submission to agreed completion state.
- Failure, return, and manual-review rate.
- Checkbook versus Plaid withdrawal volume during rollout.
- Router selection counts and reasons by processor, cohort, and rail.
- Support contacts per withdrawal and top contact reasons.

### Finance and operations reporting

At minimum, reports must support reconciliation by:

- ISD withdrawal ID;
- company/user context;
- processor and provider transaction ID;
- safe payment-method display snapshot and opaque provider reference;
- applicable SEC code, opaque Plaid authorization/POA reference, authorization
  terms version, and consent timestamp;
- requested rail: the network ISD asked Plaid to use after applying the
  user-visible transfer option and routing policy;
- effective rail: the network Plaid actually used or reported for the transfer;
- gross amount, fees, and net amount;
- submission, settlement, failure, and return timestamps;
- current normalized and provider status;
- Plaid Ledger entry or reconciliation reference where available.

For the initial ACH-only release, requested and effective rail should normally
both be ACH. They are recorded separately for auditability and future faster
rails. ISD must not silently downgrade or substitute a rail: any permitted
difference must follow approved policy, be disclosed before submission when it
changes the user promise, and record the reason.

## 11. Launch requirements

The production pilot may begin when:

1. Plaid production approval, ISD-owned API credentials, Ledger, and enabled
   Transfer capabilities are confirmed.
2. A user can add, repair/replace, select, and remove an eligible Plaid payment
   method while Plaid retains all bank authentication and sensitive bank-account
   details.
3. Integration tests confirm that ISD endpoints, logs, events, reports, and
   support tools never receive or contain bank login credentials, full account
   numbers, or routing numbers.
4. Product, Finance, Legal/Compliance, Engineering, and Plaid approve the
   applicable SEC codes and POA model; ISD maintains reproducible canonical POA
   records without raw bank details, final confirmation requires explicit user
   assent to the approved authorization language, required supplemental provider
   evidence is retrievable, and missing or revoked authorization blocks
   submission.
5. The existing MFA, balance, limits, hold, and fee controls apply to Plaid
   withdrawals.
6. New withdrawals persist the processor, opaque method reference, and safe
   payment-method display snapshot only.
7. Plaid Transfer submissions use the common routing boundary and payment-method
   abstraction.
8. The approved Checkbook initiation path is available through a common adapter
   or compatibility boundary before broad rollout.
9. Submission is idempotent and uncertain outcomes cannot trigger cross-provider
   duplicates.
10. Provider events update withdrawal status and financial effects exactly once.
11. Checkbook history and in-flight processing remain intact.
12. The feature flag controls new access and initiation on frontend and backend.
13. Finance validates funding, reconciliation, reporting, and exception handling.
14. ISD Support Operations completes training and validates support tools and
    escalation procedures.
15. Product, Finance, Support, and Engineering approve pilot scope, success
    criteria, and rollback authority.
16. Every AI-assisted implementation artifact has documented human review and
    approval, and passes the same required tests and release controls as
    human-authored work.

## 12. Operational pause and rollback behavior

An operational pause must protect financial integrity without making a cut-over
user appear to have lost their payment method or history. It must:

- stop new cohort enrollment when appropriate;
- keep the Earnings page, linked-method summary, and unified history available;
- disable only new Cash Out submission and show a clear temporary-unavailability
  message with the best available next step or Support path;
- preserve the user's Plaid method so recovery does not require relinking;
- leave submitted Plaid withdrawals bound to Plaid;
- continue processing Plaid status, settlement, failure, and return events;
- keep Plaid withdrawals visible to users and Support;
- preserve reconciliation and reporting until all Plaid activity is terminal.

An operational pause is expected to be short-lived. A prolonged Plaid outage
requires an explicit incident decision about customer communications and
service restoration. Rollback is not processor failover for an existing
withdrawal or an automatic restoration of legacy initiation. Re-enabling
Checkbook for a cut-over cohort requires a deliberate Product, Finance,
Operations, and Engineering decision and a coherent user transition; it must
never happen as a hidden router fallback.

## 13. Dependencies and risks

| Area | Dependency or risk |
| --- | --- |
| Plaid approval | Production access, supported use case, limits, reserves, and rails must match ISD's withdrawal model |
| Token-only boundary | The approved Plaid configuration must support Auth and Transfer without returning bank login credentials or full account/routing details to ISD |
| Nacha POA | Incorrect SEC classification, missing authorization, inadequate retention/retrieval, or failure to honor revocation can create compliance and return exposure |
| Funding | Insufficient Plaid Ledger balance can stop withdrawals and create customer-impacting delays |
| Existing data | Legacy `PaymentAccount.bankAccountId` is not a Plaid method and must not be silently repurposed |
| Abstraction scope | An overly broad model can hide processor behavior; an overly narrow model can hard-code Plaid into the withdrawal lifecycle |
| Legacy adoption | Refactoring Checkbook and launching Plaid simultaneously can increase risk; use a tested compatibility boundary and migrate incrementally |
| Status mapping | Plaid and Checkbook statuses differ; user history needs stable ISD meaning plus exact provider status |
| RTP | Eligibility, funding, pricing, timing, and fallback behavior may differ materially from current Checkbook Instant Transfer |
| Returns | A returned Transfer can require financial reversal and customer/support action after apparent completion |
| Rollout gating | Frontend-only gating could allow unintended backend initiation; both boundaries must enforce eligibility |
| Support readiness | A smoother bank-linking UI can still increase support demand during migration and institution-specific failures |
| Fee copy | Existing app and help-center fee/timing language has known inconsistencies that must be resolved before revised customer copy |

## 14. Open product decisions

1. Should rollout eligibility live at company level, user level, or require
   both?
2. What is the agreed user-facing completion state: provider submission,
   settlement, or another confirmed availability milestone?
3. What are the canonical withdrawal fee, timing, limit, and hold messages?
4. Which Plaid connection problems use Update Mode versus account replacement?
5. What evidence is required before a future mandatory migration or Checkbook
   retirement decision?
6. Which routing rules are fixed for launch, and which require an operationally
   controlled configuration?
7. What canonical ISD POA content, supplemental provider evidence, and
   retrieval/export process will satisfy requirements for each approved ACH
   transaction type, SEC code, and processor?

## 15. Product acceptance outcome

The feature is successful when eligible new and existing users can securely
connect a bank in ISD and complete reliable Plaid Transfer withdrawals, while
ISD preserves existing financial controls and history, Finance can fund and
reconcile the new processor, Support can resolve user issues, and rollout can be
expanded or paused without duplicating or losing withdrawals. The product also
has reusable payment-method and processor-routing boundaries so future
processors can be evaluated and added without creating another parallel
withdrawal implementation.
