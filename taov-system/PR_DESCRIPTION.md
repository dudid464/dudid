TAOV introduces a separate local Hebrew business assistant under taov-system; the original Abirit HTML page remains unchanged.

Includes authenticated SQLite-backed leads, families, workers, matching, cases, tasks, document attachments, rule-based local search, reports and CSV exports, admin/editor/viewer roles, audit events, overdue checks with simulated notifications, and encrypted backup/merge restore. Google integration implements server-side read-only requests but requires credentials and network access; no live Google call was made. There is no WhatsApp send implementation.

Validation: npm install; npm test (10 tests passed); npm run check; Chromium smoke check covering login, record persistence, document upload/download, reports, local assistant, mobile layout and logout. Docker configuration is supplied but not built or validated. Windows steps are documented but were not executed on Windows.

This is a minimal local implementation based on available requirements, not a restoration of missing code or a production-ready deployment. Assistant search is deterministic, roles are system-wide, backups are manual, account lifecycle tools are limited, and no external preview was provisioned. No main branch changes, deployment or real notifications.
