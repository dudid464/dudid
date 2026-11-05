TAOV now supports the next local business workflow: complete user management, Hebrew management reporting, contract-signature drafts, staged spreadsheet import and daily encrypted recovery.

- Add/change role/reset password/change own password/disable and reactivate users. Revoke existing sessions and preserve the last active administrator.
- Show open leads, matches in progress, overdue tasks and expected revenue from open cases. Export a Hebrew PDF with an embedded licensed font and verified right-to-left text order.
- Save synthetic signature-request drafts referencing a document version and SHA-256 hash. No sending or legal signing implementation.
- Preview CSV UTF-8 and XLSX (including worksheet selection), map columns, review errors and duplicate-name warnings, and explicitly commit a transactional local import. Google Sheets uses GET only, with the same preview flow and synthetic mock validation. No live Google credential was used.
- Create daily AES-256-GCM backups on startup/Israeli-day boundaries while running, retain recent backups, export encrypted files and a separate recovery key. Include a tested full recovery CLI that refuses to overwrite an existing directory.
- Preserve the original Abirit HTML and main branch.

Validation completed:

- npm test: 19 passing tests, on the host and in the final Docker image.
- npm run check, frontend syntax checks, npm audit (zero reported vulnerabilities).
- Expanded Chromium smoke check: core records, attachments, dashboard/PDF, user-role screen, signature draft, CSV preview/mapping/commit, key download, mobile width and logout.
- PDF rasterized and visually inspected; Hebrew text extraction verified.
- Docker build with verified TLS/temporary proxy CA mount; functional smoke test passed including login, metrics, PDF, automatic backup, healthy healthcheck and volume persistence after container recreation. Temporary test resources removed.

Limits: synthetic local development only; rule-based assistant; global rather than per-case roles; backup scheduling needs a running server. Windows instructions are documented but not tested on Windows. Live Google access needs a read-only token and network permission. No real messages, Google writes, deployment or main merge. Public preview exposure is unavailable in this environment. Git push works, but GitHub API access currently returns 403; automatic PR creation/update remains blocked until environment access is enabled.
