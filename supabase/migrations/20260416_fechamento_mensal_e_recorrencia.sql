-- Fortalece recorrencia de gastos fixos e fechamento mensal

alter table public.gastos
  add column if not exists competencia_mes date not null default date_trunc('month', current_date)::date;

update public.gastos
set competencia_mes = date_trunc('month', data)::date
where competencia_mes is null
   or competencia_mes <> date_trunc('month', data)::date;

create unique index if not exists uq_gastos_recorrencia_mes
  on public.gastos(origem_recorrente_id, competencia_mes)
  where origem_recorrente_id is not null;

alter table public.fechamentos_mensais
  add column if not exists status_fechamento text not null default 'aberto'
  check (status_fechamento in ('aberto', 'fechado'));

alter table public.fechamentos_mensais
  add column if not exists fechado_em timestamptz;

alter table public.fechamentos_mensais
  add column if not exists fechado_por uuid references public.usuarios(id) on delete set null;
