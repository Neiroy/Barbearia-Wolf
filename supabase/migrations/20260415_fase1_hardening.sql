-- Fase 1 hardening: comissao server-side + categorias financeiras + fechamento semanal

alter table public.gastos
  drop constraint if exists gastos_tipo_check;

alter table public.gastos
  add constraint gastos_tipo_check
  check (tipo in ('fixo', 'variavel', 'produto', 'manutencao', 'operacao', 'outros'));

drop index if exists public.idx_unico_funcionario;
alter table public.usuarios drop constraint if exists ck_funcionario_nome_kayke;

alter table public.fechamentos_semanais
  add column if not exists status_pagamento text not null default 'aberto'
  check (status_pagamento in ('aberto', 'pago'));

create or replace function public.atendimento_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_servico record;
  v_percentual numeric(5,2);
  v_tipo text;
begin
  select id, valor, valor_editavel into v_servico
  from public.servicos
  where id = new.servico_id and ativo = true;

  if v_servico.id is null then
    raise exception 'Servico invalido ou inativo.';
  end if;

  select tipo, percentual_comissao
    into v_tipo, v_percentual
  from public.usuarios
  where id = new.usuario_id;

  if v_percentual is null then
    raise exception 'Funcionario invalido para comissao.';
  end if;

  if v_tipo = 'admin' then
    v_percentual := 100;
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

drop trigger if exists trg_atendimento_before_insert on public.atendimentos;
create trigger trg_atendimento_before_insert
before insert on public.atendimentos
for each row execute function public.atendimento_before_insert();

create or replace function public.registrar_atendimento(
  p_usuario_id uuid,
  p_cliente_nome text,
  p_servico_id uuid,
  p_valor_informado numeric,
  p_data_hora timestamptz default now()
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.atendimentos (
    usuario_id,
    cliente_nome,
    servico_id,
    valor_servico,
    percentual_comissao,
    valor_comissao,
    data_hora
  )
  values (
    p_usuario_id,
    p_cliente_nome,
    p_servico_id,
    coalesce(p_valor_informado, 0),
    0,
    0,
    coalesce(p_data_hora, now())
  )
  returning id into v_id;

  return v_id;
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
    count(*) as total_atendimentos,
    coalesce(sum(a.valor_servico), 0)::numeric as total_vendido,
    coalesce(sum(a.valor_comissao), 0)::numeric as total_comissao
  from public.atendimentos a
  join public.usuarios u on u.id = a.usuario_id
  where a.data_hora >= (p_inicio::timestamptz)
    and a.data_hora < ((p_fim + 1)::timestamptz)
  group by a.usuario_id, u.nome;
$$;
