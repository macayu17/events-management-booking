# Backend Scripts

Run scripts from `backend/` so relative imports, Prisma, and `.env` loading behave consistently.

## Supported maintenance

- `npm run tickets:check` - list recent tickets and compare the ticket ID stored in the DB with the ID inside each QR payload.
- `npm run tickets:backfill -- --limit=50` - dry-run regeneration for paid orders missing ticket records/PDFs. Add `-- --apply` to mutate data; scope with `--order-id=...` or `--event-id=...`.
- `npm run payments:reconcile-phonepe -- --limit=25 --min-age-minutes=5` - dry-run stale PhonePe orders after a customer paid but missed the browser callback. Add `-- --apply` to mutate data.
- `npm run payments:reconcile-razorpay -- --limit=25 --min-age-minutes=60` - dry-run stale Razorpay orders; paid provider orders would complete, old unpaid orders would fail and release checkout holds. Add `-- --apply` to mutate data.
- `npm run payments:release-stale-checkouts -- --limit=100` - dry-run stale checkout holds that never reached a payment provider. Add `-- --apply` to release them.
- `ADMIN_EMAIL=user@example.com CONFIRM_ADMIN_EMAIL=user@example.com npm run admin:set` - promote an existing user to `ADMIN`.
- `node scripts/smoke-workflow.mjs` - run an end-to-end backend workflow against local `http://localhost:5000`. Remote `SMOKE_BASE_URL` values are refused unless `ALLOW_REMOTE_SMOKE=true` and `CONFIRM_REMOTE_SMOKE=<exact-base-url>` are set.

## Diagnostic scripts

These are intentionally opt-in because they can print database records, storage URLs, or payment/debug payloads.
Sensitive URLs are redacted by default; set `ALLOW_SENSITIVE_DEBUG_OUTPUT=true` only when you need full signed URLs in the terminal.

Set `ALLOW_DEBUG_SCRIPTS=true` before running:

- `node scripts/debug-cert-urls.mjs`
- `node scripts/debug-certs.mjs`
- `node scripts/debug-tickets.mjs`

Additional targeted debug scripts have their own required environment variables:

- `ALLOW_DEBUG_SCRIPTS=true CLOUDINARY_DEBUG_PUBLIC_ID=... node scripts/debug-cloudinary-download.mjs`
- `ALLOW_DEBUG_SCRIPTS=true CLOUDINARY_DEBUG_URL=... node scripts/debug-cloudinary-sign.mjs`
- `ALLOW_DEBUG_SCRIPTS=true DEBUG_EXPIRY_EVENT_QUERY=... node scripts/debug-expiry.mjs`
- `ALLOW_DEBUG_SCRIPTS=true DEBUG_SCAN_TICKET_PREFIX=... DEBUG_SCAN_EMAIL=... DEBUG_SCAN_PASSWORD=... node scripts/debug-scan.mjs` inspects by default. Add `DEBUG_SCAN_APPLY=true` only when you intend to check the ticket in.

Do not add new one-off scripts without an explicit env guard and a note here.
