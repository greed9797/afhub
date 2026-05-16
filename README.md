# AFHUB

Plataforma de automação de afiliados ponta-a-ponta. Conecta contas Mercado Livre, Shopee e TikTok Shop via OAuth, escaneia produtos por nicho, gera vídeos com Vertex AI Veo 3, publica em TikTok / YouTube / Instagram e mede CTR / GMV / conversão.

Dois componentes principais:

| Componente | Stack | Porta dev |
|---|---|---|
| `affiliate-engine/` | Node.js + Hono + BullMQ + Supabase | `:3001` |
| `app/` (dashboard Next.js) | Next.js 15 + React + Tailwind | `:3000` |

Compartilham infra local via `docker-compose.dev.yml` (Redis + Postgres + Auth + REST + Storage + Studio + Kong).

---

## Fluxo operacional

```
Conta cadastrada
  → OAuth (ML / Shopee / TikTok Shop)
  → Readiness check (can_scan / can_affiliate)
  → Nicho com filtros (keywords, comissão min, vendas min, preço, avaliação)
  → Scanner busca produtos nas 3 plataformas em paralelo
  → Score = (comissão*0.5 + vendas*0.3 + avaliação*0.2) normalizado
  → Salva em product_candidates (status: pending)
  → Notificação Telegram + fila visual no dashboard
  → Operador aprova (web ou inline keyboard Telegram)
  → affiliate-queue
  → Worker affiliate: select_least_loaded_account → gera link → baixa imagens
  → Cria affiliated_products + agenda 2 video jobs (product + lifestyle, delay 10min)
  → video-generation-queue
  → Gemini gera prompt EN → Vertex AI Veo 3 gera vídeo 9:16
  → Upload bucket affiliate-videos
  → publication-queue
  → Publisher: Gemini gera title/desc/hashtags por plataforma
  → Cria publications (status: scheduled, slots 11:00 e 19:00 BRT, mínimo 4h entre posts)
  → publish-cron varre vencidas → TikTok / YouTube / Instagram
  → Link publicado: /api/r/:affiliatedProductId (rastreável)
  → Clique → affiliate_events → redirect → afiliate_link real
  → POST /api/affiliate/analytics/import (pedidos + GMV das plataformas)
  → Dashboard analytics: GMV, CTR, conversão, comissão, EPC, ranking
```

---

## Estrutura

```
affiliate-engine/
├── src/
│   ├── routes/          # accounts, niches, approvals, products, videos,
│   │                    # publications, analytics, settings, scanner
│   ├── connectors/      # mercadolivre, shopee, tiktokshop (search + affiliate)
│   ├── services/        # oauth, scanner, telegram, approval, analytics-import,
│   │                    # publishers (tiktok, youtube, instagram)
│   ├── workers/         # affiliate, video-generation, publisher, publish-cron
│   ├── lib/             # supabase, redis, vertex (Veo 3), gemini, crypto, http
│   ├── middleware/auth  # valida INTERNAL_API_KEY no header
│   └── index.ts         # entry Hono server :3001
│
app/
├── api/affiliate/[[...path]]/route.js   # proxy injeta INTERNAL_API_KEY
├── dashboard/
│   ├── accounts/        # conectar / refresh OAuth
│   ├── niches/          # CRUD nichos
│   ├── scanner/         # dispara scan + lista resultados
│   ├── approvals/       # fila com cards + aprovar/rejeitar
│   ├── products/        # affiliated_products
│   ├── videos/          # video_jobs (status, prompt, mp4)
│   ├── publications/    # calendário + por plataforma
│   ├── analytics/       # dashboards GMV/CTR/conversão
│   └── settings/        # readiness por conta
│
supabase/
├── migrations/
│   ├── 001_initial_schema.sql           # RLS + buckets affiliate-products/videos
│   ├── 002_official_api_readiness.sql   # capabilities + api_access_status
│   ├── 003_helpers.sql                  # select_least_loaded_account + índices
│   └── 20260514000000_affiliate_analytics.sql  # events + orders + imports
└── local/                                # Kong, Auth helpers, init scripts
```

---

## Setup local

### Pré-requisitos

- Node.js 22+
- Docker (Colima ou Docker Desktop)
- `gh` CLI (opcional, para PRs)

### Subir infra Supabase + Redis

```bash
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps    # 9 containers healthy
```

Serviços expostos:

| Serviço | URL |
|---|---|
| Supabase API (Kong) | `http://localhost:54321` |
| Supabase Studio | `http://localhost:54323` |
| Postgres direto | `localhost:5432` (postgres/postgres) |
| Redis | `localhost:6379` |
| Inbucket (mail dev) | `http://localhost:54324` |

### Aplicar migrations

```bash
for m in supabase/migrations/{001,002,003}_*.sql supabase/migrations/20260514*.sql; do
  PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d postgres -f "$m"
done
```

### Env vars

Copiar `.env.example` → `.env.local` (raiz) e `affiliate-engine/.env.example` → `affiliate-engine/.env`.

Mínimo para rodar local:

```bash
# Raiz (.env.local)
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<service_role do compose anchor>
INTERNAL_API_KEY=dev-secret-key
AFFILIATE_ENGINE_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3001

# affiliate-engine/.env
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<mesmo>
REDIS_URL=redis://localhost:6379
INTERNAL_API_KEY=dev-secret-key
ENCRYPTION_KEY=<32+ chars>
PORT=3001
TZ=America/Sao_Paulo
```

Vars opcionais (necessárias só para features específicas):

| Var | Feature |
|---|---|
| `ML_APP_ID` / `ML_CLIENT_SECRET` / `ML_AFFILIATE_LINK_API_URL` ou `ML_TRACKED_URL_TEMPLATE` + `ML_AFFILIATE_TAG` | Mercado Livre OAuth + links |
| `SHOPEE_AFFILIATE_APP_ID` / `SHOPEE_AFFILIATE_SECRET` | Shopee search + affiliate |
| `TIKTOK_SHOP_APP_KEY` / `TIKTOK_SHOP_PRODUCT_SEARCH_PATH` / `TIKTOK_SHOP_AFFILIATE_LINK_PATH` | TikTok Shop |
| `GOOGLE_CLOUD_PROJECT` + `GOOGLE_SERVICE_ACCOUNT_JSON` | Vertex AI Veo 3 |
| `GOOGLE_AI_API_KEY` | Gemini (prompts + captions) |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | Notificações + approval inline |
| `PUBLISH_SLOTS` (default `11:00,19:00`) | Slots de publicação |

Se `TIKTOK_SHOP_PRODUCT_SEARCH_PATH` ausente, scanner pula TikTok Shop graciosamente (sem erro).

### Rodar dev

```bash
# Terminal 1 — engine
npm run affiliate:dev          # tsx watch :3001

# Terminal 2 — Next dashboard
npm run dev                    # next dev :3000

# Workers BullMQ (em terminais separados)
npm run affiliate:worker:affiliate
npm run affiliate:worker:video
npm run affiliate:worker:publisher
```

Dashboard: `http://localhost:3000/dashboard`

---

## Comandos comuns

```bash
# Tests engine (Vitest)
npm run affiliate:test

# TypeScript typecheck engine
node_modules/.bin/tsc --noEmit -p affiliate-engine/tsconfig.json

# Build engine produção
npm run affiliate:build        # tsc -p tsconfig.json -> dist/

# Build Next produção
npm run build

# Workers em produção
node affiliate-engine/dist/workers/affiliate.js
node affiliate-engine/dist/workers/video-generation.js
node affiliate-engine/dist/workers/publisher.js
```

---

## Deploy

### Railway (engine + Next)

Stack roda na mesma instância via `Dockerfile`:

- Base `node:22-bookworm-slim`
- ffmpeg + chromium + tzdata + TZ=America/Sao_Paulo
- Hyperframes global
- Multi-stage: deps → build → runner
- HEALTHCHECK em `/`

```bash
git push origin main           # Railway auto-deploy
```

Vars Railway obrigatórias: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `REDIS_URL` (rediss:// Upstash, **não** REST URL), `INTERNAL_API_KEY`, `ENCRYPTION_KEY`, todas as `*_API_KEY` / `*_SECRET` das plataformas que vai usar.

### Supabase produção

Aplicar todas migrations em ordem cronológica. Criar buckets `affiliate-products` e `affiliate-videos` (públicos) no Storage.

---

## Status atual

✅ **Implementado e testado em QA runtime (7/7 layers):**
- OAuth ML / Shopee / TikTok Shop (endpoints prontos, fluxo callback)
- Scanner com Promise.allSettled (tolera falha de connector)
- Score normalizado (comissão/20 + vendas/5000 + avaliação/5)
- Affiliate worker com select_least_loaded_account
- Vertex Veo 3 (image-to-video + text-to-video, polling 20×15s)
- Gemini prompts (max 480 chars, sem texto on-screen) + captions por plataforma
- Publishers TikTok (chunk + polling), YouTube (resumable), Instagram (REELS + media_publish)
- Slots configuráveis via `PUBLISH_SLOTS` (default 11:00,19:00 BRT)
- ensureFourHourSpacing entre posts mesma conta
- Tracking `/api/r/:id` → affiliate_events → redirect
- Analytics summary (GMV, CTR, conversão, EPC, byAccount, byDay, topProducts)
- Dashboard 9 páginas com dados reais (sem mocks)

⚠️ **Gaps menores conhecidos (não bloqueiam fluxo):**
- `/api/r/:id` retorna erro cru "Cannot coerce..." em UUID inválido (trocar `.single()` por check null)
- `affiliate_events` insert fire-and-forget sem error log
- Affiliate worker catch genérico relança após criar `pending_manual`

⏳ **Não testado em runtime QA (precisa credenciais reais):**
- OAuth callback completo (ML/Shopee/TikTok)
- Vertex Veo 3 generation real (precisa Service Account JSON + GCP project)
- Gemini calls (precisa `GOOGLE_AI_API_KEY`)
- Publishers (precisam `channel_ids` em accounts.channel_ids)
- Telegram bot callbacks (precisam token + webhook setup)

---

## Referências internas

- `README_AFILIADO.md` — doc original detalhado do affiliate engine
- `docs/` — mapas de fluxo, decisões arquiteturais
- `supabase/local/init/` — scripts de bootstrap do Supabase local
- `affiliate-engine/src/middleware/auth.ts` — validação `INTERNAL_API_KEY`
- `affiliate-engine/src/services/scanner.ts:12-17` — fórmula score
- `affiliate-engine/src/workers/publisher.ts:35-49` — slots BRT + 4h spacing
