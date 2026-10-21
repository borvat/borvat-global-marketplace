# BORVAT Development Environment (not deployed)

This is a local test stack, NOT a production deployment. Use a separate computer or dev environment. Required: Docker/Compose, Bun, Node >=20, Git, and Internet access for package installation.

## Database and Redis
1. Copy `infra/.env.example` to `infra/.env` and replace the password with a unique random local secret (never commit it).
2. From the repository root, run `docker compose --env-file infra/.env -f infra/compose.dev.yml up -d`.
3. Only loopback ports are published: PostgreSQL 127.0.0.1:55432 and Redis 127.0.0.1:56379.
4. Run the upstream bootstrap script in a clean separate folder and configure the resulting app to use these local services.
5. Record and pin the generated Mercur/Medusa package and lockfile versions before moving code into this repo.
6. Shut down with `docker compose --env-file infra/.env -f infra/compose.dev.yml down`. Data is retained in a named development volume.

## Important security limitations
- Compose is **development only**: Redis does not have password authentication; it is restricted to loopback. Do not deploy this compose file to a public server.
- Default demo passwords from upstream MUST be rotated/disabled before exposure.
- The repository .gitignore excludes .env files, but users must still check `git status` and scan commits for secrets.
- Running tests does not demonstrate payment, tax, authorization or live readiness.
- Do not connect Sam, Lovable, QNAN, or payment provider credentials to this stack.

## Verification
Run `node --test scripts/check-foundation.mjs` for local source-structure checks. These checks do NOT test the Mercur runtime.
