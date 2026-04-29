-- Permite usar excluir_venda_com_itens no SQL Editor (role postgres),
-- sem remover a validacao de admin para chamadas do app autenticado.

create or replace function public.excluir_venda_com_itens(p_venda_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user = 'postgres' then
    delete from public.atendimentos where venda_id = p_venda_id;
    delete from public.vendas where id = p_venda_id;
    return;
  end if;

  if auth.uid() is null then
    raise exception 'Sessao invalida.';
  end if;

  if not public.is_admin() then
    raise exception 'Apenas administrador pode excluir venda.';
  end if;

  delete from public.atendimentos where venda_id = p_venda_id;
  delete from public.vendas where id = p_venda_id;
end;
$$;

grant execute on function public.excluir_venda_com_itens(uuid) to authenticated;
