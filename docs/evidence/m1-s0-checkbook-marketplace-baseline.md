# M1-S0 — Checkbook Marketplace Sandbox Baseline

Status: Review-ready · Captured: 2026-08-07T18:17:35Z

Phase: [Plaid Auth + Checkbook Marketplace Silent Payout](../architecture/phases/m1-checkbook-marketplace-silent-payout.md)

## Containment

- Checkbook host: `sandbox.checkbook.io`
- Provider access: GET-only wallet and bank queries
- Provider mutations: none
- Money movement: none
- Provisioning or verification mutations: none
- Local SQLite refresh/mutation: none
- Secrets and full bank details: neither captured nor printed

## Selected acceptance entity

Use `owner1` / Avery Owner for the first controlled payout path.

| Attribute | Baseline |
| --- | --- |
| Marketplace user | `tfulton+owner1@isheepdog.com` |
| Participant status | `VERIFIED` |
| Wallet | `384c962c506d43b6898a4d5dad047b98` |
| Live wallet balance | $0.00 |
| Expected ISD backing | $24,866.00 |
| Marketplace bank in Checkbook | None |
| Local Marketplace attachment | None |

This entity has sufficient canonical entitlement for small acceptance payouts
but requires wallet funding and a Plaid-authenticated Checkbook bank before a
wallet-to-bank payout can be attempted.

## Live Checkbook balances

| Holder | Wallet | Live balance | Expected ISD backing | Funding gap |
| --- | --- | ---: | ---: | ---: |
| Master treasury | Master Funding Wallet | $316,000.00 | — | — |
| `owner1` / Avery Owner | Avery Owner Wallet | $0.00 | $24,866.00 | $24,866.00 |
| `owner2` / Jordan Hauling LLC | Jordan Hauling LLC Wallet | $0.00 | $39,985.00 | $39,985.00 |
| `broker1` / Morgan Broker | Morgan Broker Wallet | $0.00 | $75,000.00 | $75,000.00 |
| `broker2` / Summit Brokerage LLC | Summit Brokerage LLC Wallet | $0.00 | $100,000.00 | $100,000.00 |

- Total participant target: $239,851.00
- Treasury balance after fully manifesting all four targets: $76,149.00
- Checkbook returned no bank accounts for the treasury or any of the four
  participants.
- Local `marketplace_payment_methods` count: `0`
- Wallet IDs returned live matched the IDs persisted locally.
- Local cached wallet values remain stale at $0.00, last synchronized on
  2026-07-21. No refresh was performed during this slice.

## Repository gates

| Command | Result |
| --- | --- |
| `npm run check` | Pass |
| `npm run build` | Pass |
| `npm ci --dry-run` | Pass |
| `npm test` | Baseline failure: 14 pass, 1 fail |
| `git diff --check` | Pass |

The failing test is
`reservation rejects an amount exceeding available earnings and posts no ledger entries`
in `payment-api/test/demo-cash-out-reservation.test.js`. The reservation is
rejected, but the assertion expects `[]` while fixture initialization has
already created the immutable `seed-owner1` earnings entry. No Marketplace
provider call or M1 implementation is involved.

## Rendered UI baseline

The local Marketplace page was rendered and inspected at
`http://localhost:3010/flows/plaid-checkbook-marketplace` on 2026-08-07.

Visible and working:

- all four Marketplace participants and Sandbox-only labeling;
- selected entity, canonical ISD available balance, participant wallet, and
  Marketplace identity;
- expected wallet backing and funding variance;
- persisted Plaid payout method with replace/remove controls;
- separate Checkbook attachment action and attachment state;
- immutable cross-experiment ledger history.

Findings to carry forward:

- the UI showed the locally cached treasury balance as $0.00 while the direct
  Checkbook GET returned $316,000.00;
- the page needs timestamped provider freshness and must not represent a stale
  cache value as a current zero;
- Avery has a persisted Plaid method (`Tartan Bank · Plaid Checking ····0000`)
  but no bank attached to the Checkbook Marketplace user, correctly showing
  these as separate states;
- the full ledger is useful evidence but is too long for the primary CTO demo;
  the payout-specific history and summary should precede the diagnostic ledger.

No UI mutation control was invoked during the baseline inspection.

## M1-S0 conclusion

M1-S0 is review-ready.

- Sandbox containment is confirmed.
- The funded treasury is sufficient for the planned participant manifestation.
- `owner1` is the selected first test entity.
- M1-S1 may perform withdrawal-capability discovery without moving funds.
- M1-S2 must establish the first participant bank attachment.
- Any wallet funding remains an explicit later provider mutation and was not
  authorized or performed in this baseline slice.
