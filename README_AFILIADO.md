# AfiliadoOS

Sistema de automação de afiliados adicionado em módulos separados do `packages/studio`.

## Estrutura

- `affiliate-engine/`: API Hono, OAuth, connectors, BullMQ workers, clientes Gemini/Veo e publishers.
- `app/dashboard/`: dashboard Next.js para contas, nichos, scanner, aprovações, produtos, vídeos, publicações e settings.
- `supabase/migrations/001_initial_schema.sql`: schema base com RLS habilitado, API readiness e buckets públicos `affiliate-products` e `affiliate-videos`.
- `supabase/migrations/002_official_api_readiness.sql`: atualização incremental para contas/candidatos com capabilities, fonte da API e método de link.
- `app/api/affiliate/[[...path]]/route.ts`: proxy server-side que injeta `INTERNAL_API_KEY` sem expor segredo no browser.

## Setup local

1. Instale dependências:

```bash
npm install
```

2. Configure `.env` na raiz e `affiliate-engine/.env` a partir dos exemplos.

3. Aplique a migration no Supabase:

```bash
supabase db push
```

4. Rode o backend:

```bash
npm run affiliate:dev
```

5. Rode os workers em terminais separados:

```bash
npm run affiliate:worker:affiliate
npm run affiliate:worker:video
npm run affiliate:worker:publisher
```

6. Rode o Next:

```bash
npm run dev
```

Abra `http://localhost:3000/dashboard`.

## Redis / BullMQ

BullMQ precisa de Redis TCP (`rediss://...`). A URL REST da Upstash (`UPSTASH_REDIS_REST_URL`) não funciona como backend de fila. Configure `UPSTASH_REDIS_URL`, `REDIS_URL` ou `BULLMQ_REDIS_URL`.

## APIs de afiliados

Abra `Dashboard > Settings > API Readiness` antes de rodar scans reais. O sistema só deve operar com contas aprovadas e capabilities explícitas; quando a API estiver ausente ou pendente, o connector bloqueia a ação e registra erro legível.

### Mercado Livre

Configure `ML_APP_ID`, `ML_CLIENT_SECRET` e `ML_REDIRECT_URI` fixo, por exemplo `http://localhost:3001/api/accounts/auth/callback`. O `accountId` vai no parâmetro OAuth `state`; não use redirect URI com `{accountId}` dinâmico.

Descoberta usa Items/Search oficial. Link afiliado não usa endpoint universal inventado: configure `ML_AFFILIATE_LINK_API_URL` se o seu programa aprovou uma API oficial, ou `ML_TRACKED_URL_TEMPLATE` + `ML_AFFILIATE_TAG` somente se o programa permitir link rastreado. Sem uma dessas opções, a afiliação é bloqueada para aprovação/configuração manual. Comissão fica `estimated` por padrão quando não houver fonte oficial.

### Shopee

Configure `SHOPEE_AFFILIATE_APP_ID`, `SHOPEE_AFFILIATE_SECRET` e, para Brasil, `SHOPEE_AFFILIATE_GRAPHQL_URL=https://open-api.affiliate.shopee.com.br/graphql`. O connector usa Shopee Affiliate GraphQL com assinatura:

`Authorization: SHA256 Credential={AppId}, Timestamp={Timestamp}, Signature={SHA256(AppId + Timestamp + Payload + Secret)}`

As operações implementadas são `productOfferV2` para ofertas e `generateShortLink` para short link. Produtos sem comissão oficial entram como `not_affiliable`.

### TikTok Shop

Configure `TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET`, `TIKTOK_REDIRECT_URI`, `TIKTOK_SHOP_PRODUCT_SEARCH_PATH` e tokens OAuth de merchant/creator. O conector assina chamadas TikTok Shop Open API com query params ordenados e HMAC-SHA256.

Afiliado TikTok só é habilitado quando `TIKTOK_SHOP_AFFILIATE_LINK_PATH` estiver configurado com o endpoint aprovado para a sua app/conta no Partner Center. Sem isso, o sistema bloqueia geração de link em vez de tentar endpoint não autorizado. A publicação TikTok é separada do TikTok Shop e usa Content Posting API com polling de status.

## Vídeo e publicação

- Gemini 2.5 Flash gera prompts Veo e copy de publicação.
- Vertex AI usa `veo-3.0-generate-preview`, aspect ratio fixo `9:16`.
- O worker agenda dois vídeos por produto aprovado: `product` e `lifestyle`.
- O publisher agenda slots padrão `11:00` e `19:00` e evita menos de 4h entre posts da mesma conta.

## Plano operacional de analytics (100% funcional)

### Variáveis reais (fornecer no seu `.env` antes do `npm run build`)

- Supabase/Service role: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Runtime/segurança: `INTERNAL_API_KEY`, `ENCRYPTION_KEY`.
- Infra: `UPSTASH_REDIS_URL` (ou `REDIS_URL`/`BULLMQ_REDIS_URL`), `PORT`.
- Frontend/backend: `NEXT_PUBLIC_API_URL`, `PUBLIC_API_URL`, `AFFILIATE_ENGINE_MOCK`, `AFFILIATE_TRACKING_BASE_URL`, `CORS_ORIGIN`.
- Conta/integração ML: `ML_APP_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`, `ML_AFFILIATE_LINK_API_URL` ou `ML_TRACKED_URL_TEMPLATE`, `ML_AFFILIATE_TAG`.
- Conta/integração Shopee: `SHOPEE_AFFILIATE_APP_ID`, `SHOPEE_AFFILIATE_SECRET`, `SHOPEE_AFFILIATE_GRAPHQL_URL`, `SHOPEE_REDIRECT_URI`, `SHOPEE_TOKEN_URL`, `SHOPEE_REFRESH_URL`.
- Conta/integração TikTok Shop: `TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET`, `TIKTOK_SHOP_AFFILIATE_LINK_PATH`, `TIKTOK_SHOP_PRODUCT_SEARCH_PATH`, `TIKTOK_REDIRECT_URI`.
- Imports oficiais (somente quando aprovados): `ML_AFFILIATE_REPORT_API_URL`, `SHOPEE_REPORT_API_URL`, `TIKTOK_REPORT_API_URL`.

### Confirmação de contas aprovadas

- Use o endpoint de readiness para validar: `/api/affiliate/settings/readiness`.
- Em produção, no app, confirme:
  - `api_access_status === "approved"`
  - capacidades `can_scan`, `can_affiliate`, `can_report` (quando aplicável)
- Só execute `scanner/run` para contas com status aprovado.

### Ambiente de destino

- Defina `NEXT_PUBLIC_API_URL` e `PUBLIC_API_URL` pelo ambiente alvo (local/staging/prod).
- Para produção, mantenha `AFFILIATE_ENGINE_MOCK=false`.

### Endpoints de smoke para validação final

```bash
npm run affiliate:test
npm test
npm run build

# Engine on :3001
curl http://localhost:3001/health

# Next on :3000
curl -s http://localhost:3000/api/affiliate/health
curl -s http://localhost:3000/api/affiliate/accounts
curl -s http://localhost:3000/api/affiliate/settings/readiness
curl -s http://localhost:3000/api/affiliate/scanner/results
curl -s http://localhost:3000/api/affiliate/products
curl -s http://localhost:3000/api/affiliate/publications
curl -s 'http://localhost:3000/api/affiliate/analytics/summary?from=2026-04-01&to=2026-04-30&account_id=all&platform=all'
```

### Próximos passos práticos (após conectores oficiais)

- Ativar import oficial de pedidos (por plataforma) via `POST /api/affiliate/analytics/import` com `source=official`.
- Habilitar agendamento de importação (cron) chamando esse endpoint.

## Segurança

- Tokens OAuth são salvos com AES-256-GCM usando `ENCRYPTION_KEY`.
- O frontend não acessa Supabase diretamente.
- O dashboard chama o proxy Next, e o proxy chama o Hono com `Authorization: Bearer INTERNAL_API_KEY`.
- RLS está habilitado nas tabelas públicas; o backend usa service role server-side.
