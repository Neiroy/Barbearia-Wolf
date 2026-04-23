-- Semana fixa da barbearia (terca a sabado) + snapshots de fechamento

alter table public.fechamentos_semanais
  add column if not exists pago_em timestamptz,
  add column if not exists fechado_por uuid references public.usuarios(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.fechamentos_semanais
  drop constraint if exists fechamentos_semanais_semana_inicio_check;

-- Normaliza historico legado para o ciclo fixo (terca -> sabado)
-- e consolida possiveis colisoes de periodo por funcionario.
create temporary table tmp_fechamentos_semanais_normalizados as
with normalized as (
    select
      f.id,
      f.usuario_id,
      (
        f.semana_inicio
        - ((extract(dow from f.semana_inicio)::int - 2 + 7) % 7) * interval '1 day'
      )::date as semana_inicio_norm,
      (
        f.semana_inicio
        - ((extract(dow from f.semana_inicio)::int - 2 + 7) % 7) * interval '1 day'
        + interval '4 day'
      )::date as semana_fim_norm,
      f.total_servicos,
      f.total_vendido,
      f.total_comissao,
      f.status_pagamento,
      f.pago_em,
      f.fechado_por,
      f.created_at,
      f.updated_at
    from public.fechamentos_semanais f
  )
select
  gen_random_uuid() as id,
  n.usuario_id,
  n.semana_inicio_norm as semana_inicio,
  n.semana_fim_norm as semana_fim,
  coalesce(sum(n.total_servicos), 0)::int as total_servicos,
  coalesce(sum(n.total_vendido), 0)::numeric(10,2) as total_vendido,
  coalesce(sum(n.total_comissao), 0)::numeric(10,2) as total_comissao,
  case when bool_or(n.status_pagamento = 'pago') then 'pago' else 'aberto' end as status_pagamento,
  max(n.pago_em) as pago_em,
  (
    array_remove(array_agg(n.fechado_por order by n.pago_em desc nulls last), null)
  )[1] as fechado_por,
  min(n.created_at) as created_at,
  max(n.updated_at) as updated_at
from normalized n
group by n.usuario_id, n.semana_inicio_norm, n.semana_fim_norm;

delete from public.fechamentos_semanais;

insert into public.fechamentos_semanais (
  id,
  usuario_id,
  semana_inicio,
  semana_fim,
  total_servicos,
  total_vendido,
  total_comissao,
  status_pagamento,
  pago_em,
  fechado_por,
  created_at,
  updated_at
)
select
  id,
  usuario_id,
  semana_inicio,
  semana_fim,
  total_servicos,
  total_vendido,
  total_comissao,
  status_pagamento,
  pago_em,
  fechado_por,
  created_at,
  updated_at
from tmp_fechamentos_semanais_normalizados;

alter table public.fechamentos_semanais
  add constraint fechamentos_semanais_semana_inicio_check
  check (extract(dow from semana_inicio) = 2);

alter table public.fechamentos_semanais
  drop constraint if exists fechamentos_semanais_semana_fim_check;

alter table public.fechamentos_semanais
  add constraint fechamentos_semanais_semana_fim_check
  check (extract(dow from semana_fim) = 6);

alter table public.fechamentos_mensais
  add column if not exists mes integer,
  add column if not exists ano integer,
  add column if not exists data_inicio date,
  add column if not exists data_fim date,
  add column if not exists updated_at timestamptz not null default now();

update public.fechamentos_mensais
set
  mes = extract(month from referencia_mes),
  ano = extract(year from referencia_mes),
  data_inicio = date_trunc('month', referencia_mes)::date,
  data_fim = (date_trunc('month', referencia_mes) + interval '1 month - 1 day')::date
where mes is null
   or ano is null
   or data_inicio is null
   or data_fim is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_fechamentos_semanais_set_updated_at on public.fechamentos_semanais;
create trigger trg_fechamentos_semanais_set_updated_at
before update on public.fechamentos_semanais
for each row execute function public.set_updated_at();

drop trigger if exists trg_fechamentos_mensais_set_updated_at on public.fechamentos_mensais;
create trigger trg_fechamentos_mensais_set_updated_at
before update on public.fechamentos_mensais
for each row execute function public.set_updated_at();

create or replace function public.resumo_semanal_por_funcionario(
  p_inicio date,
  p_fim date
)
returns table (
  usuario_id uuid,
  funcionario_nome text,
  total_atendimentos bigint,
  total_vendido numeric,
  total_comissao numeric
)
language sql
security invoker
set search_path = public
as $$
  select
    a.usuario_id,
    u.nome as funcionario_nome,
    count(distinct a.venda_id) as total_atendimentos,
    coalesce(sum(a.valor_servico), 0)::numeric as total_vendido,
    coalesce(sum(a.valor_comissao), 0)::numeric as total_comissao
  from public.atendimentos a
  join public.usuarios u on u.id = a.usuario_id
  where a.data_hora >= (p_inicio::timestamptz)
    and a.data_hora < ((p_fim + 1)::timestamptz)
    and extract(dow from a.data_hora at time zone 'utc') between 2 and 6
    and u.recebe_comissao = true
    and u.participa_fechamento_comissao = true
  group by a.usuario_id, u.nome;
$$;
