# Barbearia Wolf - Sistema Web

Sistema completo com:
- Frontend em React + Vite + Tailwind CSS
- Backend em Supabase (Auth + Postgres + RLS)
- Perfis de acesso: `admin` e `funcionario`
- Atendimento por ordem de chegada (sem agendamento)
- Painéis separados, com financeiro mensal e fechamento semanal

## Funcionalidades

### Admin
- Dashboard geral
- CRUD de funcionários (nome e percentual de comissão)
- CRUD de serviços
- Visualização de todos os atendimentos
- Relatórios semanais por funcionário
- Controle financeiro mensal
- Cadastro e exclusão de gastos fixos/variáveis
- Cálculo automático de entradas, comissões e lucro

### Funcionário
- Dashboard próprio
- Lançamento de atendimento
- Histórico dos próprios atendimentos
- Resumo semanal de produção e comissão

## Estrutura de banco no Supabase

Arquivo SQL completo em: `supabase/schema.sql`
Migrations incrementais em: `supabase/migrations/`

Tabelas:
- `usuarios`
- `servicos`
- `atendimentos`
- `gastos`
- `fechamentos_semanais`
- `fechamentos_mensais`

Inclui:
- Relacionamentos corretos
- Constraints
- RLS habilitado
- Policies por perfil

## Configuração de ambiente

1. Copie:
```bash
cp .env.example .env
```

2. Preencha as variáveis:
```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Importante:
- Nunca versione `.env` com dados reais.
- Mantenha apenas `.env.example` no repositório.

## Rodando localmente

```bash
npm install
npm run dev
```

Build de produção:
```bash
npm run build
```

## Deploy Netlify

Projeto já possui `netlify.toml` com:
- comando de build: `npm run build`
- publish: `dist`
- redirect SPA para `index.html`
- headers de segurança para produção

## Hardening de persistência (vendas)

- Migração recomendada para produção: `supabase/migrations/20260415_venda_transacional_hardening.sql`
- Esta migração adiciona `venda_id` e função transacional `registrar_venda(...)`
- O frontend passa a gravar múltiplos serviços de uma venda em uma única operação atômica
- Evita gravação parcial e elimina agrupamento frágil por heurística de data/nome

## Observações importantes

- O sistema **não possui agendamento**, somente atendimento por ordem de chegada.
- O valor da comissão é calculado automaticamente ao registrar atendimento.
- O financeiro mensal consolida:
  - Entradas (atendimentos)
  - Gastos (fixos e variáveis)
  - Comissões
  - Lucro bruto e líquido
