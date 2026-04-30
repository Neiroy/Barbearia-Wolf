-- Permite marcar pagamento para:
-- 1) admin
-- 2) funcionario dono da venda (usuario_id da venda = auth.uid())
-- Mantem bloqueio para terceiros e evita spoof de "marcado_por" vindo do client.

create or replace function public.marcar_venda_pago(
  p_venda_id uuid,
  p_forma_pagamento text default null,
  p_valor_pago numeric default null,
  p_observacao text default null,
  p_marcado_por uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(10,2);
  v_venda_usuario_id uuid;
  v_actor_id uuid;
  v_is_admin boolean;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Sessao invalida.';
  end if;

  select usuario_id
    into v_venda_usuario_id
  from public.vendas
  where id = p_venda_id;

  if v_venda_usuario_id is null then
    raise exception 'Venda nao encontrada.';
  end if;

  v_is_admin := public.is_admin();

  if not v_is_admin and v_venda_usuario_id <> v_actor_id then
    raise exception 'Sem permissao para marcar pagamento desta venda.';
  end if;

  select coalesce(sum(valor_servico), 0)
    into v_total
  from public.atendimentos
  where venda_id = p_venda_id;

  if coalesce(v_total, 0) <= 0 then
    raise exception 'Venda sem valor de servicos.';
  end if;

  update public.vendas
  set
    status_pagamento = 'pago',
    forma_pagamento = nullif(btrim(p_forma_pagamento), ''),
    valor_pago = coalesce(nullif(p_valor_pago, 0), v_total),
    data_pagamento = now(),
    observacao_pagamento = nullif(btrim(p_observacao), ''),
    atualizado_por = v_actor_id,
    updated_at = now()
  where id = p_venda_id;

  perform public.recalcular_comissao_venda(p_venda_id);
end;
$$;

grant execute on function public.marcar_venda_pago(uuid, text, numeric, text, uuid) to authenticated;
