-- Organizacao de vendas x atendimentos sem perda de historico.
-- Regra de dominio:
-- - vendas = cabecalho da comanda/atendimento (1 registro por venda)
-- - atendimentos = itens/servicos da venda (N registros por venda)

-- 1) Garantir total da venda consistente com a soma dos itens atuais
update public.vendas v
set
  valor_total = coalesce(s.total, 0),
  updated_at = now()
from (
  select venda_id, coalesce(sum(valor_servico), 0)::numeric(10,2) as total
  from public.atendimentos
  group by venda_id
) s
where v.id = s.venda_id
  and v.valor_total is distinct from s.total;

-- 2) Trigger para manter valor_total sempre sincronizado
create or replace function public.sync_venda_total_from_atendimentos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  if tg_op = 'INSERT' then
    v_old := null;
    v_new := new.venda_id;
  elsif tg_op = 'DELETE' then
    v_old := old.venda_id;
    v_new := null;
  else
    v_old := old.venda_id;
    v_new := new.venda_id;
  end if;

  if v_old is not null then
    update public.vendas v
    set
      valor_total = coalesce(x.total, 0),
      updated_at = now()
    from (
      select coalesce(sum(a.valor_servico), 0)::numeric(10,2) as total
      from public.atendimentos a
      where a.venda_id = v_old
    ) x
    where v.id = v_old;
  end if;

  if v_new is not null and v_new is distinct from v_old then
    update public.vendas v
    set
      valor_total = coalesce(x.total, 0),
      updated_at = now()
    from (
      select coalesce(sum(a.valor_servico), 0)::numeric(10,2) as total
      from public.atendimentos a
      where a.venda_id = v_new
    ) x
    where v.id = v_new;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_sync_venda_total_from_atendimentos on public.atendimentos;
create trigger trg_sync_venda_total_from_atendimentos
after insert or update of valor_servico, venda_id or delete
on public.atendimentos
for each row execute function public.sync_venda_total_from_atendimentos();

-- 3) Permitir exclusao administrativa de vendas (quando realmente necessario)
drop policy if exists "vendas_admin_delete" on public.vendas;
create policy "vendas_admin_delete"
on public.vendas
for delete
using (public.is_admin());

-- 4) RPC segura para remover venda de teste e seus itens no mesmo comando
create or replace function public.excluir_venda_com_itens(p_venda_id uuid)
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
    raise exception 'Apenas administrador pode excluir venda.';
  end if;

  delete from public.atendimentos where venda_id = p_venda_id;
  delete from public.vendas where id = p_venda_id;
end;
$$;

grant execute on function public.excluir_venda_com_itens(uuid) to authenticated;
