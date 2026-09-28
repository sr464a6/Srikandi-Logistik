# PT Srikandi Factory OS

Internal factory operations starter for testing. Stack: React + Vite + Hono + Cloudflare Workers + D1.

## Windows quick start

Use **Node.js 20+**. Cloudflare's current Wrangler documentation supports current/active/maintenance Node versions; this project declares Node >=20.

From PowerShell, in this folder:

```powershell
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Open the URL printed by Vite.

### Demo accounts

All demo accounts use password `Demo123!`:

- admin@srikandi.local / ADMIN
- manager@srikandi.local / MANAGER
- operator@srikandi.local / OPERATOR
- qc@srikandi.local / QC
- warehouse@srikandi.local / WAREHOUSE

## Important npm fix

The Cloudflare Workers types package uses a `5.x` versioning scheme. The original project requested `@cloudflare/workers-types@^4.20260921.0`, which does not exist. The project is now pinned to the currently published `^5.20260922.1`.

If you were using an older copy of this project, replace `package.json` with this fixed copy or change:

```json
"@cloudflare/workers-types": "^5.20260922.1"
```

Then rerun:

```powershell
npm install
```

If npm left a partial install behind, it is safe to clean the project first:

```powershell
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm cache verify
npm install
```

## Cloudflare deployment

Create a D1 database once:

```powershell
npx wrangler login
npx wrangler d1 create srikandi-factory-db
```

Copy the returned database ID into `wrangler.jsonc`:

```json
"database_id": "YOUR_REAL_D1_DATABASE_ID"
```

Then run:

```powershell
npm run db:migrate:remote
npm run deploy
```

The Cloudflare Vite plugin integrates Vite with the Workers runtime and uses `wrangler.jsonc`; the current Cloudflare docs show this same deployment flow.

## Local API

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/dashboard`
- `GET/POST /api/materials`
- `GET/POST /api/production-orders`
- `PATCH /api/production-orders/:id/status`
- `GET/POST /api/purchase-orders`
- `GET /api/suppliers`
- `GET/POST /api/qc-inspections`
- `GET/POST /api/maintenance/work-orders`
- `PATCH /api/maintenance/work-orders/:id/status`
- `GET/POST /api/stock-movements`
- `GET /api/audit-logs`
- `GET/POST /api/users`

## Cloudflare reference

- https://developers.cloudflare.com/workers/vite-plugin/get-started/
- https://developers.cloudflare.com/workers/vite-plugin/tutorial/
