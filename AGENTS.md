# Spendmap personal finance example

Preserve the graph-first Spendmap experience from the local prototype. Shared UI and model code must work in both the browser-only website preview and the authenticated standalone app. Never import SDK credentials or server code into the browser.

Amounts are integer cents. Only expenses count as spending; income and transfers stay visible but are excluded from graph, calendar and daily totals. Unknown imported merchants stay uncategorised. Merchant matching is an illustrative local heuristic, not BankLink enrichment. Keep original descriptions and imported IDs, and preserve user classifications across duplicate imports.

The backend accepts only BankLink test keys for /v1. Live banking and multi-user access are outside this starter. Never commit secrets, statements or personal transaction data. Run `npm test`, `npm run build` and a Docker build for packaging changes. Sync shared changes with `node scripts/sync-website.mjs /path/to/aurvex`.
