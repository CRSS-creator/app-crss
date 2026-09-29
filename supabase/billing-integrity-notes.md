# Billing integrity rollout

Required invariants:
- Additional fees remain durable liabilities until a matching invoice line is confirmed.
- A draft reservation is not proof of invoicing.
- Upfront document fees for month M become eligible in M+1.
- Late fees remain eligible for subsequent invoices; invoice synchronization must retain their identity.
- Ambiguous historical matches require review, never automatic rebilling or silent consumption.
- Preserve the owner's September 29 waivers and manual handling of Metalowe.

## Implementation and verification — 2026-09-29

Document overages are durable rows in `rozliczenia_oplaty_dodatkowe`, using `billing_origin=documents`. `billing_period` is the earliest eligible invoice period. An issued or queued invoice freezes its charges; subsequent increases create a delta for a later invoice. Retrying failed sends consolidates mutable deltas to avoid double billing. Manual fees share the same eligibility and reservation rules.

Existing editable drafts refresh when a fee changes. `claim_invoice_for_billing` reconciles and locks the final snapshot before sending. A database trigger also rejects stale claims from the old application endpoint. A linked fee is marked invoiced only after the external invoice ID exists. Draft deletion releases reservations transactionally.

`replace_wfirma_invoice_lines` replaces remote lines in one transaction and preserves fee identities and revenue categories. Missing matching lines abort replacement and return a reconciliation error. This intentionally protects data while older application code is still running: the old delete-and-insert synchronizer cannot delete linked issued fees. The new endpoint in GitHub must be deployed separately before those invoices can be synchronized through the application. No server deployment was performed in this task.

Historical imported document amounts are accounted separately from the new ledger. The owner's nine explicit waivers are preserved. The manually issued Metalowe supplement (FV 55/9/2026, 2,085 PLN net) is already present in this baseline. IDIL August has one pending 260 PLN document fee eligible for September. Five detached or incorrect manual-fee links were reconciled against actual invoice lines; no invoice amounts were changed.

Validation: 11 PostgreSQL regression tests with PGlite, TypeScript checking, and lint on changed application files. Production transaction tests generate/recalculate/claim September drafts for all five clients with pending charges and then roll back. All 1,254 existing invoice amount fingerprints remain unchanged; no linked fees are missing their invoice positions. New internal billing functions and the invoice generator are not exposed to anonymous callers.

The follow-up `reconcile_existing_invoice_drafts` migration avoids an existing BEFORE INSERT duplicate guard when updating an existing draft. It updates that draft directly; the guard remains enabled for actual inserts.
