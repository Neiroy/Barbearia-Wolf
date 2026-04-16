-- Hardening de persistencia: identificador de venda + insercao transacional em lote

create extension if not exists "pgcrypto";

alter table public.atendimentos
  add column if not exists venda_id uuid;

update public.atendimentos
set venda_id = id
where venda_id is null;

alter table public.atendimentos
  alter column venda_id set not null;

create index if not exists idx_atendimentos_venda_id
  on public.atendimentos(venda_id);

create or replace function public.registrar_venda(
  p_usuario_id uuid,
  p_cliente_nome text,
  p_data_hora timestamptz,
  p_itens jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venda_id uuid := gen_random_uuid();
  v_item jsonb;
  v_servico_id uuid;
  v_valor_informado numeric;
begin
  if p_usuario_id is null then
    raise exception 'Usuario obrigatorio para registrar venda.';
  end if;

  if coalesce(btrim(p_cliente_nome), '') = '' then
    raise exception 'Cliente obrigatorio para registrar venda.';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda precisa conter ao menos um servico.';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    v_servico_id := (v_item->>'servico_id')::uuid;
    v_valor_informado := coalesce((v_item->>'valor_informado')::numeric, 0);

    if v_servico_id is null then
      raise exception 'Servico invalido no item da venda.';
    end if;

    insert into public.atendimentos (
      venda_id,
      usuario_id,
      cliente_nome,
      servico_id,
      valor_servico,
      percentual_comissao,
      valor_comissao,
      data_hora
    )
    values (
      v_venda_id,
      p_usuario_id,
      btrim(p_cliente_nome),
      v_servico_id,
      v_valor_informado,
      0,
      0,
      coalesce(p_data_hora, now())
    );
  end loop;

  return v_venda_id;
end;
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
  group by a.usuario_id, u.nome;
$$;
