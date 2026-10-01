# Required invoice bank account

The owner selected `14 1020 4160 0000 2102 0350 8322` for all invoices created by CRSS. Supabase exposes the configured NRB through `required_invoice_bank_account()`, callable only by the server role.

Before creating a wFirma draft, the server finds exactly one matching company account by its normalized number. Missing, ambiguous, invalid or unavailable configuration stops creation. The payload supplies `company_account: { id }` and the server reads the created invoice back to verify both the relation and, when present, the account number in `company_detail.bank_account`. Failed verification retains the remote invoice ID to prevent duplicate creation.

Import and payment synchronization repair the bank account on existing remote drafts and read back the result. Finalized invoices are not rewritten by draft repair. The resolver is cached only within an individual request.

API contract verified against the official published collection at https://doc.wfirma.pl/: invoices links to company_accounts; company_accounts/find exposes `number`; invoices/get exposes `company_account.id` and `company_detail.bank_account`; invoices/edit updates an existing draft.

Nine mocked regression tests cover validation, account selection, missing/duplicate accounts, configuration failure, successful verification, repair, ignored writes, finalized invoices and request-local caching. TypeScript and lint checks pass. Live wFirma verification was unavailable because no wFirma API credentials are configured in this local workspace. No server deployment was performed; the application changes require deployment before they affect wFirma drafts.
