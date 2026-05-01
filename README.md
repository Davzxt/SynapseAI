# Synapse AI

Protótipo full-stack de uma plataforma multi-agente com visual hacker preto/branco, chat, roteador de modelos Groq, arena, missões, memória via Supabase, mundo simulado e painel admin.

## Recursos incluídos

- Chat estilo ChatGPT com histórico local e persistência opcional no Supabase.
- Orquestrador que cria agentes por modo: `fast` usa 1 agente, `deep` usa múltiplos agentes.
- Agentes com papel, tarefa, memória preparada e modelo próprio.
- Execução paralela no backend com `Promise.all`.
- Roteador Groq por prompt, modo e papel do agente.
- Debate mode/arena com agente oponente.
- Loop de auto-melhoria após a síntese.
- Parallel thinking view com painel de agentes.
- Missions com progresso e etapas.
- Synapse World em canvas, leve e cíclico.
- Mini viewer dentro do chat e botão Open World Viewer.
- Auth Supabase: login, registro, sessão e logout.
- Admin visível somente para `parreiracarvalhod@gmail.com`.
- AI Control Panel para atualizar diretivas/sistema, sem retreinar modelos.
- Export de conversas, sugestões, ranking/status visual e logs básicos.

## Setup

1. Instale dependências:

```bash
npm install
```

2. Crie `.env` a partir de `.env.example`:

```bash
cp .env.example .env
```

3. Preencha:

```env
GROQ_API_KEY=sua_chave_groq
SUPABASE_URL=https://fglvgcvppuitrrciarvg.supabase.co
SUPABASE_ANON_KEY=sua_anon_key
ADMIN_EMAIL=parreiracarvalhod@gmail.com
```

Para recursos admin server-side reais, adicione também:

```env
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
```

4. No Supabase, execute `supabase/schema.sql` no SQL Editor.

5. Rode:

```bash
npm run dev
```

Abra `http://localhost:3000`.

## Deploy na Vercel

1. Suba este projeto para um repositório GitHub.
2. Na Vercel, clique em `Add New Project` e importe o repositório.
3. Em `Settings > Environment Variables`, configure:

```env
GROQ_API_KEY=sua_chave_groq
SUPABASE_URL=https://fglvgcvppuitrrciarvg.supabase.co
SUPABASE_ANON_KEY=sua_anon_key
ADMIN_EMAIL=parreiracarvalhod@gmail.com
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_opcional_para_admin
STRIPE_SECRET_KEY=sua_chave_secreta_stripe
STRIPE_PUBLISHABLE_KEY=sua_chave_publicavel_stripe
SITE_URL=https://seu-projeto.vercel.app
```

4. Framework preset: `Other`.
5. Build command: deixe vazio ou use `npm run vercel-build`.
6. Output directory: deixe vazio. Nao coloque `public`.
7. Deploy.

As rotas serverless ficam em `/api/config`, `/api/chat`, `/api/admin/settings` e `/api/create-checkout-session`. As chaves Groq e Stripe devem ficar somente nas variáveis da Vercel, nunca no JavaScript público.

## Donate com Stripe

A aba `Donate` cria uma sessão Stripe Checkout de US$1. Para funcionar em produção:

1. Crie uma conta Stripe.
2. Copie a chave secreta `sk_live_...` ou use `sk_test_...` para teste.
3. Adicione `STRIPE_SECRET_KEY` na Vercel.
4. Adicione `SITE_URL` com a URL final do projeto.

## Segurança

- A chave Groq nunca deve ir para o frontend. Ela fica apenas no `.env`.
- O frontend recebe apenas URL e anon key do Supabase.
- Admin visual é bloqueado por email, e o SQL aplica RLS para `system_settings`.
- Para banir/deletar usuários de verdade, use `SUPABASE_SERVICE_ROLE_KEY` e expanda os endpoints admin no backend.

## Estrutura

```text
server.js
api/
  _shared.js
  config.js
  chat.js
  create-checkout-session.js
  admin/settings.js
public/
  index.html
  styles.css
  app.js
supabase/
  schema.sql
.env.example
package.json
README.md
```
