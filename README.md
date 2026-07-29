# payment-test

TypeScript monorepo for payment integration experiments.

## Packages

- `common`: shared library
- `payment-api`: server-side payment integration library; depends on `common`
- `payment-ui`: Next.js frontend; depends on `common` and `payment-api`

## Commands

```sh
npm install
npm run check
npm run build
```

## Configuration

Environment configuration lives at the repository root. Copy `.env.example` to
`.env.local` and keep local values or secrets in the ignored `.env.local` file.

Plaid credentials are server-side configuration and must never be exposed with
a `NEXT_PUBLIC_` prefix.

## Plaid Auth sandbox

The implemented cash-out pages share the same Plaid Auth sequence:

1. Select a fictitious owner-operator or broker with seeded demo earnings.
2. Select **Connect payout account** to open Plaid Link.
3. Complete the Sandbox institution flow and choose an eligible account.
4. The server exchanges the public token and calls `/auth/get` for that account.

The browser receives masked account metadata only. Plaid access tokens remain
server-side, and raw ACH account and routing numbers are not retained.

Plaid Items and payment methods are persisted in the ignored local SQLite
database at `data/payment-test.sqlite`. SQL migrations live in
`payment-api/migrations/` and run automatically when the database opens.
Production Plaid storage is intentionally blocked until access-token encryption
is implemented.

Each demo entity automatically restores its latest active payout account after
reloads and app restarts. The UI can replace it through Plaid Link or remove it
from active lab use while retaining historical cash-out references. Removal is
local-only in this prototype; it does not revoke the Plaid Item through
`/item/remove`.

The local application ledger seeds `owner1`, `owner2`, `broker1`, and `broker2`
with $240,000 in aggregate earnings. A cash-out atomically moves earnings from
`available` to `reserved`; provider acceptance does not count as settlement.
Plaid Transfer payouts use the explicit `PLAID_LEDGER_ID`, while Checkbook
standard payouts use the configured sender's verified Sandbox funding bank.

Selecting a demo entity also loads its complete local cash-out history across
providers, including failed attempts, normalized lab status, exact provider
status, and provider transaction ID when one exists.
Submitted Plaid Transfer and Checkbook Standard rows expose an explicit
Sandbox-only completion action. Provider status is confirmed before reserved
earnings are atomically posted to paid.

## Money movement planning

The evolving provider comparison, funds-flow assumptions, data model, open
questions, and implementation checkpoints live in the
[money movement working plan](docs/money-movement-working-plan.md).
