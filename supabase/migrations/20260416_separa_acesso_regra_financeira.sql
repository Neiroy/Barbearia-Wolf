-- Separa perfil de acesso da regra financeira/comissao

alter table public.usuarios
  add column if not exists tipo_remuneracao text not null default 'comissionado'
  check (tipo_remuneracao in ('dono', 'comissionado', 'fixo'));

alter table public.usuarios
  add column if not exists recebe_comissao boolean not null default true;

alter table public.usuarios
  add column if not exists participa_fechamento_comissao boolean not null default true;

update public.usuarios
set
  tipo_remuneracao = case when tipo = 'admin' then 'dono' else 'comissionado' end,
  recebe_comissao = case when tipo = 'admin' then false else true end,
  percentual_comissao = case when tipo = 'admin' then 0 else coalesce(percentual_comissao, 0) end,
  participa_fechamento_comissao = case when tipo = 'admin' then false else true end;

create or replace function public.atendimento_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servico record;
  v_percentual numeric(5,2);
  v_recebe_comissao boolean;
begin
  select id, valor, valor_editavel into v_servico
  from public.servicos
  where id = new.servico_id and ativo = true;

  if v_servico.id is null then
    raise exception 'Servico invalido ou inativo.';
  end if;

  select percentual_comissao, recebe_comissao
    into v_percentual, v_recebe_comissao
  from public.usuarios
  where id = new.usuario_id;

  if v_percentual is null or v_recebe_comissao is null then
    raise exception 'Funcionario invalido para comissao.';
  end if;

  if v_recebe_comissao = false then
    v_percentual := 0;
  end if;

  if v_servico.valor_editavel = false then
    new.valor_servico := v_servico.valor;
  elsif new.valor_servico < v_servico.valor then
    raise exception 'Valor informado abaixo do minimo permitido.';
  end if;

  new.percentual_comissao := v_percentual;
  new.valor_comissao := round((new.valor_servico * v_percentual) / 100, 2);
  return new;
end
$$;

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
    and u.recebe_comissao = true
    and u.participa_fechamento_comissao = true
  group by a.usuario_id, u.nome;
$$;

-- Historico do dono/admin deixa de gerar comissao
update public.atendimentos a
set
  percentual_comissao = 0,
  valor_comissao = 0
from public.usuarios u
where u.id = a.usuario_id
  and u.recebe_comissao = false;

-- Recalculo dos fechamentos semanais para remover custos de quem nao participa
update public.fechamentos_semanais f
set
  total_servicos = coalesce(s.total_atendimentos, 0),
  total_vendido = coalesce(s.total_vendido, 0),
  total_comissao = coalesce(s.total_comissao, 0)
from (
  select
    a.usuario_id,
    f2.semana_inicio,
    f2.semana_fim,
    count(distinct a.venda_id) as total_atendimentos,
    coalesce(sum(a.valor_servico), 0)::numeric as total_vendido,
    coalesce(sum(a.valor_comissao), 0)::numeric as total_comissao
  from public.fechamentos_semanais f2
  join public.atendimentos a
    on a.usuario_id = f2.usuario_id
   and a.data_hora >= (f2.semana_inicio::timestamptz)
   and a.data_hora < ((f2.semana_fim + 1)::timestamptz)
  join public.usuarios u on u.id = a.usuario_id
  where u.recebe_comissao = true
    and u.participa_fechamento_comissao = true
  group by a.usuario_id, f2.semana_inicio, f2.semana_fim
) s
where f.usuario_id = s.usuario_id
  and f.semana_inicio = s.semana_inicio
  and f.semana_fim = s.semana_fim;

delete from public.fechamentos_semanais f
using public.usuarios u
where u.id = f.usuario_id
  and (u.recebe_comissao = false or u.participa_fechamento_comissao = false);
