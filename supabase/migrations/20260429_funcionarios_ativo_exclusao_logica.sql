-- Controle de ciclo de vida do funcionario sem perder historico.
-- "Excluir" aqui e exclusao logica (perfil inativo), preservando atendimentos.

alter table public.usuarios
  add column if not exists ativo boolean not null default true,
  add column if not exists desativado_em timestamptz,
  add column if not exists excluido_logico_em timestamptz;

update public.usuarios
set ativo = true
where ativo is null;

create or replace function public.definir_status_usuario(
  p_usuario_id uuid,
  p_ativo boolean,
  p_excluir_logico boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sessao invalida.';
  end if;

  if not public.is_admin() then
    raise exception 'Apenas administrador pode alterar status de funcionario.';
  end if;

  if p_usuario_id = auth.uid() then
    raise exception 'Nao e permitido desativar o proprio usuario.';
  end if;

  update public.usuarios
  set
    ativo = p_ativo,
    desativado_em = case when p_ativo then null else now() end,
    excluido_logico_em = case when p_excluir_logico then now() else excluido_logico_em end
  where id = p_usuario_id;

  if not found then
    raise exception 'Funcionario nao encontrado.';
  end if;
end;
$$;

grant execute on function public.definir_status_usuario(uuid, boolean, boolean) to authenticated;

-- Impede lancamento para funcionario inativo.
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
begin
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
end;
$$;
