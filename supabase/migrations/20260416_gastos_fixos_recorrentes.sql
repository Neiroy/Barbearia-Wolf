-- Gastos fixos recorrentes e origem para lancamentos mensais

alter table public.gastos
  add column if not exists recorrente_mensal boolean not null default false;

alter table public.gastos
  add column if not exists origem_recorrente_id uuid null references public.gastos(id) on delete set null;

create index if not exists idx_gastos_origem_recorrente_id on public.gastos(origem_recorrente_id);
create index if not exists idx_gastos_recorrente_mensal on public.gastos(recorrente_mensal);
