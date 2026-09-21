# Recurring notification flood, 2026-09-18

The generator created 201 distinct recurring-task reminders at 05:05 UTC,
including 111 for one caregiver. The existing per-realization unique index
worked: there were no duplicate realization/recipient pairs. It could not
prevent a flood of different tasks sharing one deadline. Twenty-one reminders
concerned inactive clients. The notification page also loaded only 100 rows
while the sidebar counted every unread row.

## Notification-only change

- One recurring-task digest per caregiver and due date, enforced by a unique
  index and a transaction advisory lock. The existing notification type and
  link work with the already deployed application.
- Only open tasks with active clients, templates and caregivers are included.
  The digest stores task IDs, client IDs/names, titles and periods in metadata.
- Notifications in month M select actual realizations for settlement month M-1.
  The initial fix mistakenly selected current-month tasks by their stored due
  date; changing the label alone would still leave incorrect task IDs/statuses.
  Notification deadlines stored in the settlement month are projected into
  the following month; already next-month deadlines are preserved. Short months,
  year rollover and explicitly rescheduled days are handled without modifying
  task or settlement records. Empty corrected digests become read.
- Polling updates the contents but never resets read state or creation time.
  An empty digest becomes read and remains as the idempotency record.
- Task completion, deletion and rescheduling refresh existing digests. Client
  and template changes are reflected on the next regular notification refresh.
- Authenticated generation is limited to the caller and today's Warsaw date.
  The internal helper is not callable by application users; anonymous access
  to the generator is revoked. Existing recipient RLS remains unchanged.
- Existing per-task reminders are consolidated, preserving their earliest
  timestamp and keeping the digest unread when any constituent was unread.
  No task, client or settlement records are changed by the migration.
- The page fetches every page with deterministic ordering. Concurrent page,
  layout and focus requests share one in-flight generation. Failed read updates
  no longer falsely mark rows read; successful updates refresh the badge.

## Verification

Run `node --test tests/notifications.test.cjs`, `npx tsc --noEmit`, and ESLint
on the three changed notification-related TypeScript files.

Run `tests/notifications-digest.sql` after the migration, inside `BEGIN` /
`ROLLBACK`. It uses existing digest data as fixtures and temporarily updates
task status, so **always roll back**. It checks consolidation, inactive-client
exclusion, uniqueness, repeated generation, read-state preservation, completion,
reopening, unrelated-notification preservation, RLS and caller scope.

The migration and database tests were first executed in a rolled-back
transaction. After application, three simultaneous database refreshes retained
exactly three unique digests. The six service tests, TypeScript check and lint
passed (the layout has an existing unrelated image warning).

Supabase migration version: `20260921085132`. Application deployment is manual;
this change does not deploy to the application server.

Calendar and source-period regression checks: run
`tests/notifications-settlement-period.sql` after the migrations inside
`BEGIN` / `ROLLBACK`, followed by `tests/notifications-digest.sql` for the
completion, read-state and authorization checks.
