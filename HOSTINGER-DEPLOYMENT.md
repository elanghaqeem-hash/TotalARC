# TotalARC — Hostinger Deployment Package

This branch/package adds a standard Node.js runtime path for Hostinger while preserving the existing Cloudflare deployment path.

## Recommended Hostinger settings

- Node.js: **22.x**
- Framework: Next.js / Node.js Web App
- Build command: `npm run build:hostinger`
- Start command: `npm run start:hostinger`
- Output directory (if requested): `.next`
- Project root: ZIP root (the ZIP must contain `package.json` at top level)

Hostinger currently supports ZIP deployment for Node.js apps and lets you configure the Node version, build command, start command, and environment variables during deployment.

## Superadmin

The intended superadmin is:

- Email: `serayamg@gmail.com`
- Role: `SystemAdmin` (the highest TotalARC role)

No plaintext password is stored in this package.

### Keep the exact existing password and data

Use:

```env
TOTAL_ARC_DB_DRIVER=d1-http
CLOUDFLARE_ACCOUNT_ID=...
TOTAL_ARC_D1_DATABASE_ID=...
CLOUDFLARE_D1_API_TOKEN=...
TOTAL_ARC_AUTH_SECRET=<random secret at least 32 chars>
TOTAL_ARC_BOOTSTRAP_ADMIN_EMAIL=serayamg@gmail.com
```

In this mode the Hostinger app uses the existing D1 database. Existing `AuthUser` password hashes are unchanged, so the current TotalARC password remains the same.

### Move fully off D1 to Hostinger SQLite

On a machine/VPS with the Cloudflare D1 credentials available:

```bash
cp .env.hostinger.example .env
# Fill Cloudflare credentials and TOTAL_ARC_AUTH_SECRET
export TOTAL_ARC_DB_DRIVER=sqlite
export TOTAL_ARC_SQLITE_PATH=data/totalarc.db
npm ci
npm run hostinger:import-d1
npm run hostinger:doctor
npm run build:hostinger
```

The importer copies schema and rows from D1 into local SQLite and therefore preserves password hashes and user roles. It does not run extra remote `COUNT(*)` verification queries.

After a successful import, deploy with:

```env
TOTAL_ARC_DB_DRIVER=sqlite
TOTAL_ARC_SQLITE_PATH=data/totalarc.db
TOTAL_ARC_AUTH_SECRET=<same server secret used for this deployment>
TOTAL_ARC_BOOTSTRAP_ADMIN_EMAIL=serayamg@gmail.com
```

For a brand-new empty SQLite database, set `TOTAL_ARC_BOOTSTRAP_ADMIN_PASSWORD` to the password you want for `serayamg@gmail.com`. Never put that password in Git.

## Preflight

Run:

```bash
npm run hostinger:doctor
```

The doctor checks Node compatibility, auth-secret presence, database-mode configuration, and local SQLite write access without printing secrets.

## Security notes

- Do not include `.env`, API tokens, or plaintext passwords in the ZIP.
- Use Hostinger Environment Variables for secrets.
- Use HTTPS and keep the existing TotalARC security headers enabled.
- If using D1 HTTP mode, create a dedicated Cloudflare token limited to the required D1 database.
