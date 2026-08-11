# M1-S2 — Persisted Marketplace Payout Destination

Status: Review-ready · Captured: 2026-08-07T19:03:52Z · Sandbox only

Phase: [Plaid Auth + Checkbook Marketplace Silent Payout](../architecture/phases/m1-checkbook-marketplace-silent-payout.md)

## Controlled action

Attached Avery Owner's existing persisted Plaid payment method to Avery's
Checkbook Marketplace user through the existing server integration:

1. generated a Checkbook processor token from Avery's Plaid Item/account;
2. retrieved the account through Checkbook Plaid IAV using Avery's Marketplace
   credentials;
3. added the bank under Avery's Checkbook identity;
4. persisted only the Plaid payment-method reference, Checkbook bank reference,
   status, and masked display metadata.

No funds moved.

## Result

| Attribute | Verified value |
| --- | --- |
| Demo entity | `owner1` / Avery Owner |
| Plaid display | Tartan Bank · Plaid Checking ····0000 |
| Checkbook account type | `CHECKING` |
| Checkbook status | `VERIFIED` |
| Checkbook default destination | `true` |
| Checkbook bank reference | `497339432388465bb1aa1d35d50b09b7` |
| Local attachment time | `2026-08-07T19:03:42.673Z` |

Direct `GET /v3/account/bank` under Avery's credentials returned the same bank
reference, mask, type, `VERIFIED` status, and default designation as the local
record. No other bank was returned for Avery.

## Persistence and UI

After a full page reload:

- the saved Plaid method restored without opening Plaid Link;
- the Marketplace cash-out destination restored as
  `Tartan Bank · Plaid Checking •••• 0000`;
- the UI displayed `✓ Bank attached to this Marketplace user`;
- the attachment action disappeared because no reattachment was needed;
- the participant wallet remained at $0, which is valid before an on-demand
  cash-out.

The primary page remains focused on participant overview, payout method,
cash-out, and evidence. Provisioning/reconciliation controls remain backend lab
capabilities rather than CTO-facing workflow steps.

## Trajectory adjustment

The wallet will not be funded to Avery's complete $24,866.00 ISD balance.
M1-S3 will reserve the custom cash-out amount and fund only the amount required
for that payout. Avery's $0 wallet is therefore an expected pre-cash-out state,
not a readiness failure. No funding was performed in M1-S2.

## M1-S2 conclusion

M1-S2 is review-ready. The one-time Plaid-to-Checkbook destination setup is
proven and persistent. The remaining silent-payout proof is server-driven
Marketplace submission/deposit, lifecycle observation, and a repeat payout
without Plaid or recipient interaction.

M1-S5 later proved that participant-wallet funding is not required: the
treasury Marketplace user pays Avery directly and Checkbook autodeposits to the
bank persisted in this slice.
