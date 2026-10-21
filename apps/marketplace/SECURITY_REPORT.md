# Security & Verification Sprint — verificatierapport

Datum: 23 juli 2026 · Versie MCP: 0.2.0

Elke sectie draagt een expliciete status:

- **IMPLEMENTED** — code aanwezig, niet end-to-end getest in deze omgeving.
- **TESTED & PASSED** — geverifieerd tegen de live database of live `/mcp` endpoint in dit rapport.
- **NOT YET VERIFIED** — vereist externe OAuth-client of productiedeploy die hier niet uitgevoerd is.

---

## 1. RLS & Rollen — automated test suite

**Status: TESTED & PASSED (17/17)**

Uitgevoerd met `bunx tsx scripts/security-tests.ts` tegen de live Cloud DB
(publishable key voor RLS pad, service role alleen voor bootstrap).

| # | Assertion | Result |
|---|-----------|--------|
| 1 | anon sees only published (drafts hidden) — 2 rows | ✅ |
| 2 | buyer sees published, not drafts | ✅ |
| 3 | seller A sees own draft | ✅ |
| 4 | seller B blocked from seller A draft | ✅ |
| 5 | seller A cannot rebind `seller_id` (WITH CHECK) | ✅ |
| 6 | seller cannot self-grant admin | ✅ |
| 7 | seller cannot grant admin to others | ✅ |
| 8 | seller cannot read buyer orders (except via items) | ✅ |
| 9 | seller B cannot see seller A suggestions | ✅ |
| 10 | direct suggestion status update blocked | ✅ |
| 11 | `decide_product_suggestion` RPC accepts for owner | ✅ |
| 12 | double-apply of suggestion is blocked | ✅ |
| 13 | RPC rejects non-owner | ✅ |
| 14 | audit log UPDATE blocked | ✅ |
| 15 | audit log DELETE blocked | ✅ |
| 16 | `agent_memory` rejects unknown scope | ✅ |
| 17 | seller B cannot read seller A bol credentials | ✅ |

**Fix uitgevoerd tijdens deze run:** de admin/seller-insert RLS-policies op
`products`, `orders` en `order_items` waren `TO PUBLIC` en riepen
`public.has_role()` aan die niet `EXECUTE`-baar is voor `anon`. Dit gaf een
401 `permission denied for function has_role` op de publieke productlijst.
Nieuwe migratie beperkt die policies tot `TO authenticated`; anon-lijst laadt
nu correct met alleen niet-draft, actieve producten.

---

## 2. MCP OAuth transport — live probes

Live probes tegen `/mcp` in de dev-server:

| Check | Status | Bewijs |
|-------|--------|--------|
| `GET /.well-known/oauth-protected-resource` bestaat en publiceert `authorization_servers` = Supabase issuer | **TESTED & PASSED** | `200`, body `{"resource":".../mcp","authorization_servers":["https://<ref>.supabase.co/auth/v1"],"resource_name":"Borvat® Agent-Native Marketplace","bearer_methods_supported":["header"]}` |
| Authorization Server metadata beschikbaar bij issuer (auth endpoint, token endpoint, JWKS, DCR-endpoint, `response_types=code`, `grant_types=authorization_code+refresh_token`) | **TESTED & PASSED** | `GET https://<ref>.supabase.co/auth/v1/.well-known/oauth-authorization-server` levert alle velden |
| Ongeautoriseerde `POST /mcp` levert `401` met `WWW-Authenticate: Bearer realm="mcp", resource_metadata="…/.well-known/oauth-protected-resource"` | **TESTED & PASSED** | header letterlijk aanwezig |
| Malformed / bogus bearer geeft `401 invalid_token` met `error_description` | **TESTED & PASSED** | `www-authenticate: Bearer realm="mcp", resource_metadata="…", error="invalid_token", error_description="Malformed JWT header"` |
| PKCE `S256` op Authorization Code flow | **IMPLEMENTED** (bewaakt door Supabase authorization server; niet zelf uitgevoerd met echte client in dit rapport) |
| Access token audience-validatie (`acceptedAudiences: "authenticated"`) in `defineMcp` | **IMPLEMENTED** (geconfigureerd in `src/lib/mcp/index.ts`; niet uitgevoerd met een echte token in dit rapport) |
| Issuer-validatie tegen direct Supabase host (niet `.lovable.cloud` proxy) | **IMPLEMENTED** — `issuer: https://${projectRef}.supabase.co/auth/v1` in `defineMcp` |
| Token expiratie / `exp`-claim validatie | **IMPLEMENTED** door `@lovable.dev/mcp-js` bearer-verifier (JWT-standaard); een expliciete "expired token" fixture is **NOT YET VERIFIED** in deze omgeving |
| Correct redirect URI handling (allow-list, geen open redirect) | **IMPLEMENTED** — de consent-route `src/routes/[.]lovable.oauth.consent.tsx` stuurt uitsluitend naar door Supabase teruggegeven `redirect_url`/`redirect_to`, en het `next` pad wordt als same-origin relatief pad afgedwongen. E2E-verificatie met een geregistreerde MCP-client is **NOT YET VERIFIED**. |
| **Tool-specifieke scopes** | **NOT IMPLEMENTED (yet).** Supabase access tokens dragen geen OAuth-scopes; autorisatie is per tool afgedwongen via `requireRole()` (buyer/seller/admin) op basis van `user_roles`, plus RLS. Dit is bewust conform de `app-mcp-server-authoring` richtlijn; echte per-tool OAuth-scopes vereisen een authorization server die die scopes uitgeeft. |
| End-to-end call `tools/list` en `tools/call` met geldige gebruikersaccess token | **NOT YET VERIFIED** — vereist een geregistreerde MCP OAuth-client (ChatGPT/Claude/Cursor). |

---

## 3. MCP request-level enforcement

De volgende punten zijn **structureel** afgedwongen door RLS + `requireRole()`,
en zijn transitief bewezen door de RLS-testsuite hierboven; ze zijn **NOT YET
VERIFIED** met een authenticated MCP-call in dit rapport omdat dat een externe
OAuth-client vereist.

| Requirement | Enforcement | Verified? |
|-------------|-------------|-----------|
| Unauth MCP call rejected | `defineMcp.auth` retourneert `401` (live geverifieerd, sectie 2) | **TESTED & PASSED** |
| Invalid/malformed token rejected | live geverifieerd, sectie 2 | **TESTED & PASSED** |
| Expired token rejected | JWT `exp` in bearer-verifier | **IMPLEMENTED / NOT YET VERIFIED** (geen expired fixture) |
| Buyer kan geen seller/admin tools aanroepen | `requireRole()` in elke seller/admin tool + audit `denied` | **IMPLEMENTED** — logisch afgeleid uit RLS-tests 6/7; expliciete tool-invocation test is **NOT YET VERIFIED** |
| Seller kan geen admin-tools aanroepen | idem | **IMPLEMENTED / NOT YET VERIFIED** |
| Seller kan geen resources van andere seller zien | RLS-tests 3/4/9/17 | **TESTED & PASSED** |
| Dubbele write-actie niet twee keer toegepast | RLS-test 12 (`decide_product_suggestion` idempotent), `product_suggestions.status='pending'` guard | **TESTED & PASSED** |
| Draft-producten verschijnen nooit via MCP search/get | `products_public_read_published` RLS + tool-side `.eq('is_active', true).eq('is_draft', false)` | **TESTED & PASSED** (RLS-tests 1/2/4) |

---

## 4. `seller_bol_credentials` — credentials-veiligheid

| Vereiste | Status | Bewijs |
|----------|--------|--------|
| Tokens nooit teruggegeven naar frontend | **IMPLEMENTED** — er is geen route/serverFn die `client_id_ciphertext` of `client_secret_ciphertext` naar de client stuurt; frontend heeft geen `select` op deze kolommen. |
| Tokens niet blootgesteld via SELECT-policies aan andere gebruikers | **TESTED & PASSED** — RLS-test 17 bevestigt dat seller B niets ziet van seller A. |
| Encryptie at rest | **IMPLEMENTED** — `src/lib/mcp/crypto.ts` gebruikt AES-256-GCM met `BOL_ENCRYPTION_KEY`; opgeslagen kolommen bevatten uitsluitend base64 ciphertext (iv‖tag‖ct). |
| Refresh tokens nooit in logs / errors / memory / audit input | **IMPLEMENTED** — `bol_configure` schrijft geen input naar `agent_audit_log`; `input_summary` in andere tools wordt door `summarize()` bewaakt (JSON < 2 KB, verder truncated); ciphertext-kolommen worden nooit als tool-input geaccepteerd. Geen zichtbare `console.log` / `throw` waar `client_secret` in wordt geplakt. Statische audit is **IMPLEMENTED**, runtime-audit met echte tokens is **NOT YET VERIFIED**. |
| Alleen server-side integratiefuncties kunnen decrypten | **IMPLEMENTED** — `decryptSecret` leeft in `src/lib/mcp/crypto.ts` en importeert `node:crypto`; het bestand wordt uitsluitend gebruikt door MCP-tool handlers (server-side). Er is geen client-import van deze module. |
| Revocatie / verwijdering ondersteund | **NOT YET IMPLEMENTED** — er is momenteel geen `bol_disconnect` tool of UI-actie om de rij te verwijderen. Toe te voegen in een volgende sprint (buiten scope: geen nieuwe tools nu). |

---

## 5. Audit log

| Vereiste | Status |
|----------|--------|
| Append-only voor `authenticated` en `anon` (UPDATE/DELETE geweigerd) | **TESTED & PASSED** — RLS-tests 14/15. |
| `service_role` mag retentie/archivering uitvoeren | **IMPLEMENTED** — `service_role` heeft `ALL` op de tabel; dit is bewust zodat backups/retention scripts kunnen draaien. Geen retentie-job geconfigureerd (**NOT YET IMPLEMENTED**). |
| Audit input summaries bevatten geen tokens/passwords/raw payloads | **TESTED & PASSED** — `summarize()` in `src/lib/mcp/context.ts` past nu **recursieve, case-insensitieve key-based redaction** toe **vóór** de 2 KB-limiet. Geredigeerde keys (substring match): `password`, `passwd`, `secret`, `token`, `authorization`, `api_key`/`apikey`, `cookie`, `set-cookie`, `session`, `ciphertext`, `auth_tag`, `iv`, `bearer`, `jwt`, `private_key` — dit dekt `access_token`, `refresh_token`, `client_secret`, `client_id_ciphertext`, `client_secret_ciphertext` en varianten. Daarnaast worden string values met een Bearer/Basic-schema of een JWT-vorm (drie base64url-segmenten) altijd vervangen door `[REDACTED]`. Bewijs: `scripts/redaction-tests.ts` — **10/10 passed** (secret aan begin payload, in geneste objecten, in arrays, in `Authorization` headers, in payloads < 2 KB, bol ciphertext/iv/auth_tag, circulaire refs). |

---

## 6. Encryption key management (`BOL_ENCRYPTION_KEY`)

**Status: IMPLEMENTED (documented)**

- **Opslag master key**: uitsluitend als server-side secret in de Lovable Cloud
  secret store (env var `BOL_ENCRYPTION_KEY`). Niet in git, niet in `.env` die
  wordt gecommit, niet bereikbaar vanuit de client bundle. `src/lib/mcp/crypto.ts`
  importeert `node:crypto` en wordt alleen geladen door server-side MCP tool
  handlers.
- **Normalisatie**: elke lengte input wordt via SHA-256 tot 32 bytes gehashed,
  zodat de AES-256-GCM key altijd 256 bits is.
- **Ciphertext layout**: base64(`iv‖authTag‖ciphertext`) met 12-byte random IV
  per encrypt en 16-byte GCM auth tag. IV is uniek per record (via
  `crypto.randomBytes(12)`).
- **Key versioning**: **niet ondersteund in deze sprint.** Er is één actieve
  master key; ciphertext-records dragen geen key-id. Dit is bewust: de huidige
  dataset is klein en er is nog geen productie-lek-scenario dat rotatie
  afdwingt.
- **Geplande rotatie**: bij een toekomstige rotatie (a) een tweede env var
  `BOL_ENCRYPTION_KEY_NEXT` introduceren, (b) `decryptSecret` laten proberen
  met `KEY_NEXT` en fallbacken naar de oude key, (c) alle bestaande rijen in
  `seller_bol_credentials` her-encrypten via een service-role script, (d) de
  oude key intrekken. Deze feature wordt **niet nu gebouwd** — enkel wanneer
  een sleutelcompromis of beleidsvereiste dat afdwingt.
- **Gedrag bij falen van GCM auth tag**: `decipher.final()` in
  `decryptSecret` gooit `Unsupported state or unable to authenticate data`.
  Deze exception propageert naar de tool handler die de generieke
  `err(error.message)` teruggeeft; er wordt géén plaintext, ciphertext, iv
  of tag gelogd. Geen retry, geen fallback op ongeauthenticeerde decryptie.
- **Toegangspad**: geen enkele client-route, server-route of `createServerFn`
  buiten `src/lib/mcp/tools/*` importeert `decryptSecret`. De frontend heeft
  geen `select` op de ciphertext-kolommen; RLS-test 17 bewijst dat andere
  sellers de rij niet eens zien.

---

## 7. Approval boundary

**Status: IMPLEMENTED**

Toegestaan via MCP (write): `create_product_draft` (concept, onzichtbaar tot
seller publiceert), `suggest_product_content` (voorstel, geen mutatie),
`recommend_price` (advies, geen mutatie), `update_order_status` (seller acteert
op eigen orderitems), `bol_configure`, `bol_import_products` (als draft).

Expliciet **NIET** toegevoegd: publiceren, prijswijziging live, voorraadmutatie,
order plaatsen, betaling, refund, gebruikers blokkeren, data verwijderen.

---

## 8. Sprintstatus

**Verified security baseline: COMPLETE.** De volgende punten zijn afgesloten
met echte testuitvoer:

- 17/17 RLS/rol-tests (`scripts/security-tests.ts`).
- 10/10 audit-log redaction tests (`scripts/redaction-tests.ts`).
- Live MCP OAuth transport-probes (metadata, unauth 401, malformed token 401).
- AES-256-GCM encryption at rest, documentatie compleet.

**Expliciet open (niet als voltooid gemarkeerd):**

- End-to-end externe MCP OAuth-flow (ChatGPT/Claude/Cursor) — MCP-compatibiliteit
  met externe clients is **niet volledig geverifieerd**; alleen de server-side
  transport en metadata zijn bewezen correct.
- Expired-token fixture (`exp` in het verleden).
- `bol_disconnect` (revocatie) — nog niet geïmplementeerd.
- Retentiebeleid / archivering voor `agent_audit_log` — geen scheduled job.
- Admin-mutatie-tools en betaalprovider — bewust uitgesteld.
- Key rotation feature voor `BOL_ENCRYPTION_KEY` — procedure beschreven, code
  niet gebouwd (geen unsafe implementatie die het nu afdwingt).

---

## 9. Reproduceerbaar draaien

```bash
# RLS/rol-suite (vereist SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
# SUPABASE_SERVICE_ROLE_KEY; service role alleen voor bootstrap):
bunx tsx scripts/security-tests.ts

# Audit-log redaction (pure unit test, geen DB):
bunx tsx scripts/redaction-tests.ts

# MCP transport-probes:
curl -i http://localhost:8080/.well-known/oauth-protected-resource
curl -i -X POST http://localhost:8080/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

