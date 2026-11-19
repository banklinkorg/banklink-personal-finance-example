# Spendmap — BankLink personal finance example

A graph-first personal finance app adapted from the existing local **Spendmap** prototype. Explore spending by account, merchant and day, replay a month, or switch to a monthly calendar. Includes a React frontend, Express backend, SQLite persistence and Docker setup.

The public website preview uses the same interface with browser-local fictional transactions. The standalone app adds sign-in, persistent classifications and an optional BankLink test-key sandbox integration.

## Run with Docker

```sh
git clone https://github.com/banklinkorg/banklink-personal-finance-example.git
cd banklink-personal-finance-example
node scripts/setup.mjs
docker compose up --build
```

Open **http://localhost:3110**. Read the generated password from your local `secrets/app-password` file to sign in. Setup leaves an existing password unchanged. Node 22.13+ is needed for the local setup script; the image uses Node 24. Alternatively generate the password without host Node:

```sh
docker run --rm -v "$PWD:/app" -w /app node:24-alpine node scripts/setup.mjs
```

The app binds only to loopback. SQLite is stored in the named `finance_data` volume. Stop the example with `docker compose down` to preserve the data volume. Deleting volumes deletes saved data and classifications.

## Explore the application

- **Graph:** bank accounts connect to merchant nodes. Repeated purchases grow a merchant's node. Drag to explore, zoom, and select a merchant to inspect its transactions.
- **Month controls:** select a month or account; months are derived from available data. The fictional dataset covers April–August 2026.
- **Daily timeline:** hover or keyboard-focus a day to dim unrelated graph activity. Click to pin a day filter. Play month reveals activity day by day; Full month restores all days.
- **Calendar:** daily spending totals use correct weekdays and month lengths.
- **Transactions:** search original descriptions, inspect account and merchant labels, change the suggested merchant or transaction type, and export filtered rows to CSV.
- **Breakdown:** category totals and an accessible merchant list explain the graph on wider screens. Transaction review remains available on mobile.
- **Sample/sandbox datasets:** imported sandbox data is shown separately from the fictional dataset.

Income and transfers do **not** count as spending. Gross expense totals do not automatically net credits such as refunds against earlier purchases. This is a spending explorer, not a bank-balance calculation or regulated financial advice product. Amounts are integer cents; daily, account and merchant totals derive from the same transaction records.

## Optional: BankLink sandbox imports

The app runs without any API key. Included sample records are fictional data, **not** a connection to the hosted sandbox.

Obtain a `sk_test_` BankLink key with account-read, sync, transaction-read and link capabilities. Save it with a local editor in `secrets/banklink-api-key`. Keep the parent directory private; the file must be readable through the container's read-only secret mount. Never put it in a frontend variable or commit it.

```sh
docker compose -f compose.yaml -f compose.sandbox.yaml up --build
```

Sign in and select **Update feed**. The backend uses the official Node SDK to list accounts, create a synthetic FNB account if none exist, sync and import paginated transactions. Imported IDs combine the account and external transaction ID. Duplicate imports preserve existing records and user corrections. The dataset control switches between the fictional sample and sandbox imports.

This integration deliberately uses the **/v1 test-key sandbox**. It refuses live keys. Customer-held-key v2, real bank credentials and live banking are not implemented here. Hosted sandbox verification requires your own test key; automated tests use injected synthetic responses and do not prove remote sandbox access.

Merchant recognition is a small application-side description matcher. It is not a BankLink enrichment service. Unknown merchants remain **Uncategorised**; review the suggested merchant and transaction type. The original bank description is preserved.

## Local development

```sh
npm ci
npm run setup
npm run build
npm start
```

For hot reload, run `APP_ORIGIN=http://localhost:5173 npm run server` in one terminal and `npm run dev` in another. The Vite proxy forwards `/api` to port 3110. Open http://localhost:5173.

```sh
npm test
npm run build
npm audit --omit=dev
```

Tests cover calendar boundaries, daily/account spending totals, exclusion of income and transfers, classification persistence, import normalization and deduplication, sign-in, logout and CSRF protection. The force-graph renderer loads only in the browser so the shared component is safe for website static rendering.

## Configuration and security

| Variable | Purpose / default |
| --- | --- |
| `APP_PASSWORD_FILE` | `./secrets/app-password`; random password, minimum 16 characters |
| `BANKLINK_API_KEY_FILE` | Optional server-only test-key file |
| `APP_ORIGIN` | Exact browser origin, default `http://localhost:3110` |
| `DATA_DIR` | Writable SQLite directory, default `./data` |
| `HOST` / `PORT` | Loopback / `3110` outside Docker |

The application uses scrypt password comparison, random server-side sessions stored hashed, eight-hour HttpOnly/SameSite=Strict cookies, explicit Origin checks for mutations, request validation, security headers and rate limits. HTTPS origins enable Secure cookies. Public production-mode deployments require an HTTPS origin. The non-root container has a read-only root filesystem, dropped capabilities and a writable data volume. Local secrets are excluded from Git and Docker build context.

This starter is for a **single user**. Add appropriate identity, per-user data isolation, recovery, encryption, backups and operational controls before handling customer financial data. Budgeting, recurring-payment detection, savings goals, live banking and multi-user access are possible extensions; they are not part of this release.

## Reuse on the BankLink website

```sh
node scripts/sync-website.mjs /absolute/path/to/aurvex
```

This copies `shared/` UI/model files and local merchant images into the website's personal-finance demo directories. The website wrapper supplies ephemeral state and has no API key or server access. Both repositories build independently.

## Origin and assets

The visual idea, graph interactions and local merchant library come from the existing `websitetest` Spendmap prototype. The original working directory is left unchanged. This example uses new synthetic transaction amounts and account labels; it does not copy bank statements, credentials or private transaction histories.

Code is MIT licensed. Merchant marks retain their respective rights and are not relicensed under the code's MIT licence. See [ASSET-NOTICE.md](ASSET-NOTICE.md). No merchant endorsement is implied.
