# Checklist: deploy e GitHub

Use este guia depois das melhorias no código. Ajuste nomes de branch se o seu padrão for diferente de `main`.

## 1. Ambiente local (uma vez por máquina)

1. Instale [Node.js](https://nodejs.org/) (LTS 20+ ou 22+).
2. Na pasta do projeto, copie o exemplo de variáveis:
   - Copie `.env.example` para `.env`.
3. Edite `.env` com os valores reais do Supabase (painel → **Project Settings** → **API**):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Instale dependências e valide:
   - `npm ci` (ou `npm install`)
   - `npm run lint`
   - `npm test -- --run`
   - `npm run build`

## 2. Banco Supabase (produção ou remoto)

1. No painel do Supabase, abra o projeto alvo.
2. Aplique as migrations na ordem (SQL Editor ou CLI):
   - Rode o conteúdo de `supabase/migrations/20260504130000_seguranca_rls_performance.sql` **antes** de depender só do `schema.sql` espelho, se ainda não foi aplicada no projeto.
3. Se precisar alinhar usuários do Auth com `public.usuarios`, use **manualmente** e com cuidado o script `supabase/sync_usuarios_faltantes.sql` (revisar comentários no arquivo).
4. Confirme que **RLS** e políticas estão ativas como no migration (não desligue RLS em produção sem motivo).

## 3. Git: commit e push

1. Veja o que mudou: `git status`
2. Confirme que **não** vai commitar:
   - `.env`
   - `supabase/.temp/` (deve estar ignorado; não readicione)
   - `node_modules/`, `dist/`
3. Adicione os arquivos desejados, por exemplo:
   - `git add .`
   - ou selecione pastas/arquivos específicos
4. Commit com mensagem clara, por exemplo:
   - `git commit -m "Segurança RLS, PT-BR, CI, seed e ajustes de auth"`
5. Envie ao GitHub:
   - `git push origin main`
   - (troque `main` pelo nome da sua branch padrão)

## 4. GitHub Actions (CI)

1. Após o push, aba **Actions** do repositório.
2. O workflow **CI** deve rodar: lint, testes e build.
3. Se falhar, abra o job e leia o log (geralmente `npm run lint` ou `npm test`).

## 5. Hospedagem do front (ex.: Netlify, Vercel, Cloudflare Pages)

1. Conecte o repositório ao provedor.
2. Configure variáveis de ambiente **de produção** com os mesmos nomes:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Comando de build: `npm run build`
4. Pasta de saída: `dist` (padrão Vite)
5. Faça um deploy de teste e valide login e telas principais.

### Netlify (site [barbeariawolf.netlify.app](https://barbeariawolf.netlify.app/))

O repositório já tem `netlify.toml` (build, `dist`, redirect SPA e headers). Falta só as variáveis no painel:

1. Acesse [app.netlify.com](https://app.netlify.com) e abra o site **Barbearia Wolf** (ou o nome que aparecer no dashboard).
2. **Site configuration** → **Environment variables** (ou **Build & deploy** → **Environment**).
3. Adicione (escopo **Production** e, se quiser testar PR previews, também **Deploy previews**):
   - `VITE_SUPABASE_URL` = URL do projeto (ex.: `https://xxxx.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY` = chave **anon** do Supabase (mesma do `.env` local; não use `service_role`).
4. Salve e rode **Deploys** → **Trigger deploy** → **Clear cache and deploy site** (garante que o Vite recompila com as novas variáveis).

## 6. Supabase CLI local (opcional)

1. Com [Supabase CLI](https://supabase.com/docs/guides/cli) instalado:
   - `supabase link` ao projeto remoto (se for usar push/pull).
2. `supabase db reset` recria o banco **local** e roda migrations + `seed.sql` — **não** rode isso no remoto sem saber o impacto.

---

Em caso de dúvida, mantenha `.env` só na sua máquina e no painel do host; nunca commite chaves `service_role` no repositório.
