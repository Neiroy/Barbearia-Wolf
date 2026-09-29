-- Servico avulso: item de atendimento sem servico cadastrado.
-- Atendimentos antigos permanecem com servico_id preenchido e servico_avulso_nome nulo.
-- A foreign key de servico_id e preservada.

alter table public.atendimentos
  add column if not exists servico_avulso_nome text;

alter table public.atendimentos
  alter column servico_id drop not null;

alter table public.atendimentos
  drop constraint if exists atendimentos_servico_origem_check;

alter table public.atendimentos
  add constraint atendimentos_servico_origem_check
  check (
    (
      servico_id is not null
      and servico_avulso_nome is null
    )
    or (
      servico_id is null
      and servico_avulso_nome is not null
      and length(btrim(servico_avulso_nome)) > 0
    )
  );

-- Validacao do item: servico cadastrado permanece igual; avulso nao consulta servicos.
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
  v_status text;
  v_ativo boolean;
  v_avulso text;
begin
  if new.servico_id is not null then
    select id, valor, valor_editavel into v_servico
    from public.servicos
    where id = new.servico_id and ativo = true;

    if v_servico.id is null then
      raise exception 'Servico invalido ou inativo.';
    end if;

    select percentual_comissao, recebe_comissao, coalesce(ativo, true)
      into v_percentual, v_recebe_comissao, v_ativo
    from public.usuarios
    where id = new.usuario_id;

    if v_percentual is null or v_recebe_comissao is null then
      raise exception 'Funcionario invalido para comissao.';
    end if;

    if not v_ativo then
      raise exception 'Funcionario inativo. Reative o perfil para lancar atendimento.';
    end if;

    if v_recebe_comissao = false then
      v_percentual := 0;
    end if;

    select status_pagamento into v_status
    from public.vendas
    where id = new.venda_id;

    if v_status is null then
      raise exception 'Venda nao encontrada para o atendimento.';
    end if;

    if v_servico.valor_editavel = false then
      new.valor_servico := v_servico.valor;
    elsif new.valor_servico < v_servico.valor then
      raise exception 'Valor informado abaixo do minimo permitido.';
    end if;

    new.percentual_comissao := v_percentual;

    if v_recebe_comissao and v_status = 'pago' then
      new.valor_comissao := round((new.valor_servico * v_percentual) / 100, 2);
    else
      new.valor_comissao := 0;
    end if;

    return new;
  end if;

  v_avulso := nullif(btrim(coalesce(new.servico_avulso_nome, '')), '');
  if v_avulso is null then
    raise exception 'Servico invalido ou inativo.';
  end if;

  new.servico_avulso_nome := v_avulso;

  if coalesce(new.valor_servico, 0) <= 0 then
    raise exception 'Valor do servico avulso deve ser maior que zero.';
  end if;

  select percentual_comissao, recebe_comissao, coalesce(ativo, true)
    into v_percentual, v_recebe_comissao, v_ativo
  from public.usuarios
  where id = new.usuario_id;

  if v_percentual is null or v_recebe_comissao is null then
    raise exception 'Funcionario invalido para comissao.';
  end if;

  if not v_ativo then
    raise exception 'Funcionario inativo. Reative o perfil para lancar atendimento.';
  end if;

  if v_recebe_comissao = false then
    v_percentual := 0;
  end if;

  select status_pagamento into v_status
  from public.vendas
  where id = new.venda_id;

  if v_status is null then
    raise exception 'Venda nao encontrada para o atendimento.';
  end if;

  new.percentual_comissao := v_percentual;

  if v_recebe_comissao and v_status = 'pago' then
    new.valor_comissao := round((new.valor_servico * v_percentual) / 100, 2);
  else
    new.valor_comissao := 0;
  end if;

  return new;
end;
$$;

-- Itens cadastrados continuam com servico_id. Itens avulsos usam servico_avulso_nome.
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
  v_avulso text;
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

  insert into public.vendas (
    id,
    usuario_id,
    cliente_nome,
    data_hora,
    status_pagamento,
    valor_total,
    valor_pago
  )
  values (
    v_venda_id,
    p_usuario_id,
    btrim(p_cliente_nome),
    coalesce(p_data_hora, now()),
    'pendente',
    0,
    0
  );

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    if nullif(btrim(coalesce(v_item->>'servico_id', '')), '') is null then
      v_servico_id := null;
    else
      v_servico_id := (v_item->>'servico_id')::uuid;
    end if;

    v_avulso := nullif(btrim(coalesce(v_item->>'servico_avulso_nome', '')), '');
    v_valor_informado := coalesce((v_item->>'valor_informado')::numeric, 0);

    if v_servico_id is not null and v_avulso is not null then
      raise exception 'Item da venda nao pode misturar servico cadastrado e avulso.';
    end if;

    if v_servico_id is null and v_avulso is null then
      raise exception 'Servico invalido no item da venda.';
    end if;

    if v_servico_id is null and v_valor_informado <= 0 then
      raise exception 'Valor do servico avulso deve ser maior que zero.';
    end if;

    insert into public.atendimentos (
      venda_id,
      usuario_id,
      cliente_nome,
      servico_id,
      servico_avulso_nome,
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
      v_avulso,
      v_valor_informado,
      0,
      0,
      coalesce(p_data_hora, now())
    );
  end loop;

  update public.vendas
  set valor_total = (
    select coalesce(sum(valor_servico), 0)
    from public.atendimentos
    where venda_id = v_venda_id
  )
  where id = v_venda_id;

  return v_venda_id;
end;
$$;
