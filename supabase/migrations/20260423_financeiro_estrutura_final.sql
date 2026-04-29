-- Estrutura final: comissoes (audit trail) + snapshot mensal completo

alter table public.fechamentos_mensais
  add column if not exists faturamento_equipe numeric(10,2) not null default 0,
  add column if not exists faturamento_admin numeric(10,2) not null default 0,
  add column if not exists comissao_paga numeric(10,2) not null default 0,
  add column if not exists comissao_pendente numeric(10,2) not null default 0;

create table if not exists public.comissoes_pagamentos (
  id uuid primary key default gen_random_uuid(),
  fechamento_semanal_id uuid not null unique references public.fechamentos_semanais(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  semana_inicio date not null,
  semana_fim date not null,
  valor_pago numeric(10,2) not null default 0 check (valor_pago >= 0),
  pago_em timestamptz not null default now(),
  marcado_por uuid references public.usuarios(id) on delete set null,
  status_registro text not null default 'pago' check (status_registro in ('pago', 'reaberto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extract(dow from semana_inicio) = 2),
  check (extract(dow from semana_fim) = 6)
);

create index if not exists idx_comissoes_pagamentos_usuario_periodo
  on public.comissoes_pagamentos(usuario_id, semana_inicio desc);

create index if not exists idx_comissoes_pagamentos_pago_em
  on public.comissoes_pagamentos(pago_em desc);

drop trigger if exists trg_comissoes_pagamentos_set_updated_at on public.comissoes_pagamentos;
create trigger trg_comissoes_pagamentos_set_updated_at
before update on public.comissoes_pagamentos
for each row execute function public.set_updated_at();

alter table public.comissoes_pagamentos enable row level security;

drop policy if exists "comissoes_pagamentos_admin_select" on public.comissoes_pagamentos;
create policy "comissoes_pagamentos_admin_select"
on public.comissoes_pagamentos
for select
using (public.is_admin());

drop policy if exists "comissoes_pagamentos_funcionario_select_proprio" on public.comissoes_pagamentos;
create policy "comissoes_pagamentos_funcionario_select_proprio"
on public.comissoes_pagamentos
for select
using (usuario_id = auth.uid());

drop policy if exists "comissoes_pagamentos_admin_manage" on public.comissoes_pagamentos;
create policy "comissoes_pagamentos_admin_manage"
on public.comissoes_pagamentos
for all
using (public.is_admin())
with check (public.is_admin());
