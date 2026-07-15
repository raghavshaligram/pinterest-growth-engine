
## Scope — Pinterest automation, BYOK from day one

Single-user app. Backend on Lovable Cloud. **All third-party credentials are managed by you in-app via `/settings/integrations`** — no secrets pasted through the Lovable add-secret flow, no `.env` prompts. You can rotate, disconnect, and switch providers without a code change.

## BYOK model (the change)

- Credentials stored in a dedicated `integrations` table, one row per provider, per user.
- Values encrypted at rest with AES-256-GCM using `INTEGRATIONS_ENC_KEY` (auto-generated on first boot, stored as a Lovable Cloud secret — the only secret in the whole app).
- Only the service-role server client reads/writes this table; browser never sees ciphertext or plaintext.
- Settings UI shows: provider, status (connected / needs setup / failing), last-used, "Test connection" button, "Rotate" and "Disconnect".
- Every server function that hits an external provider calls `getIntegration(userId, provider)` — no `process.env.OPENAI_API_KEY` reads anywhere in app code.

Providers managed this way:

| Provider | Fields | Purpose |
|---|---|---|
| OpenAI | `api_key` | Page analysis, pin strategy, copy, pattern clustering |
| Replicate | `api_token` | Nano Banana 2 image generation (`google/nano-banana-2`) |
| Apify | `api_token`, `actor_id` (default `fatihtahta/pinterest-scraper-search`) | Pinterest SERP + rank tracking (and publishing fallback later) |
| Pinterest | `access_token`, `refresh_token`, `app_id`, `app_secret` | Publishing + analytics (populate once approval lands) |
| Website (self) | `base_url`, `sitemap_url` | Source of truth for crawler |

Publisher adapter reads these at run time and picks the mode automatically:
1. Pinterest credentials present → API v5
2. Else Apify publisher configured → Apify actor
3. Else → CSV/ZIP export you download

## What ships in this first turn (end-to-end)

1. **Auth + shell** — email/password sign-in, sidebar nav.
2. **Settings → Integrations** — the BYOK panel described above. First-run wizard nudges you here.
3. **Sites** — add site + sitemap URL.
4. **Crawler** — sitemap parser, page fetcher, extracts title/H1/meta/headings/images/JSON-LD; change detection.
5. **Page analyzer** (OpenAI via your key) — topic, primary + secondary keywords, intent, category, audience, seasonality.
6. **Pin strategy generator** — N pin briefs per page (mixed styles: how-to, checklist, comparison, calculator, mistakes, before/after, listicle, FAQ).
7. **Image generation** — Replicate `google/nano-banana-2` at 1000×1500; results persisted to Supabase Storage (Replicate URLs expire in ~1h); prompt-hash dedup.
8. **Boards** — CRUD (name + Pinterest board ID).
9. **Scheduler** — month/week calendar, drag-and-drop, "Auto-fill next 30 days" respecting same-URL cooldown, no image reuse, per-day cap, posting hours, timezone.
10. **Publisher** — cron every 15 min; adapter picks API / Apify / export.
11. **Apify SERP + rank tracker** — daily snapshot per tracked keyword via `fatihtahta/pinterest-scraper-search`; OpenAI clusters winning patterns.
12. **Dashboard** — pins published today, scheduled, pages waiting, image queue, publish queue, failures, top keywords + trend, recent activity, integration health.

## Deferred (later turns, roadmap intact)

Learning loop feeding winners back into generator prompts, A/B promotion, evergreen recycling (>30 days data), deep analytics dashboards, competitor monitoring, multi-tenant, Canva, brand kits, weekly AI reports.

## Data model (Postgres, RLS by `auth.uid()`)

```text
integrations       (user_id, provider, config_ciphertext, status, last_used_at, last_error, updated_at)
sites              (id, user_id, url, sitemap_url, timezone, settings jsonb)
pages              (site_id, url, title, h1, meta, content_hash, headings jsonb,
                    images jsonb, jsonld jsonb, analysis jsonb, status,
                    last_crawled_at, last_analyzed_at)
keywords           (page_id, keyword, kind, tracked bool)
serp_snapshots     (keyword, captured_at, top_pins jsonb, patterns jsonb)
rank_history       (keyword, captured_at, position, our_pin_id)
boards             (id, user_id, name, pinterest_board_id, keywords text[], category)
pin_briefs         (id, page_id, style, title, description, hashtags text[],
                    alt_text, cta, image_prompt, board_id, status)
pin_images         (id, brief_id, storage_path, prompt_hash, replicate_prediction_id, meta jsonb)
scheduled_pins     (id, brief_id, image_id, board_id, scheduled_at,
                    status queued|publishing|published|failed|exported,
                    pinterest_pin_id, attempts, last_error, published_at)
publish_logs       (id, scheduled_pin_id, at, level, message, payload jsonb)
jobs               (id, kind, payload jsonb, status, run_at, attempts, last_error)
```

## Cron (pg_cron → signed server routes, `CRON_SECRET` auto-generated)

- `0 4 * * *`   crawl sites
- `15 4 * * *`  analyze new/changed pages
- `30 4 * * *`  generate pin briefs
- `0 3 * * *`   Apify SERP + rank sweep
- `*/10 * * * *` image-gen worker (Replicate)
- `*/15 * * * *` publisher
- `0 5 * * *`   auto-schedule fill

## Files

- Routes: `/`, `/auth`, `/_authenticated/dashboard`, `/sites`, `/pages`, `/pages/$id`, `/pins`, `/pins/$id`, `/schedule`, `/boards`, `/keywords`, `/settings`, `/settings/integrations`, `/logs`
- `src/lib/integrations/*` — table, crypto (AES-256-GCM), `getIntegration`, `saveIntegration`, `testIntegration`
- `src/lib/openai/*`, `src/lib/replicate/*`, `src/lib/apify/*`, `src/lib/pinterest/*` — each reads credentials via `getIntegration(userId, provider)`
- `src/lib/pinterest/PinterestClient.ts` (interface) + `apiClient.ts` + `apifyPublisher.ts` + `exportClient.ts`
- Cron in `src/routes/api/public/cron/*`
- Design system in `src/styles.css` — dark editorial, warm Pinterest red + deep charcoal (no AI-purple defaults)

## Auto-provisioned secrets (only these two)

- `INTEGRATIONS_ENC_KEY` — I generate on first boot (32-byte, AES-256-GCM)
- `CRON_SECRET` — I generate on first boot

Every other credential lives in the DB, entered by you in `/settings/integrations`.

## End-of-turn definition of done

Sign in → open Settings → paste OpenAI + Replicate + Apify keys (test buttons go green) → add harvestmath.com + sitemap → "Crawl now" → open a page → "Generate 10 pins" → images render via Nano Banana 2 → drag onto calendar → publisher exports ZIP (or publishes if you've added Pinterest credentials) → overnight cron pulls SERP + rank data.

Approve and I'll start building.
