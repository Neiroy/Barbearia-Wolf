-- Seguranca (Supabase advisors): search_path imutavel, RPC sem anon, triggers sem RPC publico.
-- Performance RLS: auth.uid() / is_admin() avaliados uma vez por query (initplan).
-- Integridade leve: valor_pago coerente com valor_total.

-- 1) Trigger helper: search_path fixo (lint 0011)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- 2) Indices para filtros frequentes do app (listagens por usuario e periodo)
create index if not exists idx_atendimentos_usuario_data_hora
  on public.atendimentos (usuario_id, data_hora desc);

create index if not exists idx_atendimentos_data_hora
  on public.atendimentos (data_hora desc);

create index if not exists idx_vendas_usuario_status
  on public.vendas (usuario_id, status_pagamento);

-- 3) Integridade de caixa na venda (permite parcial: valor_pago <= valor_total)
alter table public.vendas
  drop constraint if exists vendas_valor_pago_nao_supera_total;

alter table public.vendas
  add constraint vendas_valor_pago_nao_supera_total
  check (valor_pago <= valor_total);

-- 4) RLS: substitui policies para padrao (select auth.*) / (select public.is_admin())
drop policy if exists "usuarios_admin_ou_proprio_select" on public.usuarios;
create policy "usuarios_admin_ou_proprio_select"
on public.usuarios
for select
using ((select public.is_admin()) or id = (select auth.uid()));

drop policy if exists "usuarios_admin_update" on public.usuarios;
create policy "usuarios_admin_update"
on public.usuarios
for update
using ((select public.is_admin()));

drop policy if exists "usuarios_admin_insert" on public.usuarios;
create policy "usuarios_admin_insert"
on public.usuarios
for insert
with check ((select public.is_admin()));

drop policy if exists "usuarios_admin_delete" on public.usuarios;
create policy "usuarios_admin_delete"
on public.usuarios
for delete
using ((select public.is_admin()));

drop policy if exists "servicos_select_todos_logados" on public.servicos;
create policy "servicos_select_todos_logados"
on public.servicos
for select
using ((select auth.uid()) is not null);

drop policy if exists "servicos_admin_manage" on public.servicos;
create policy "servicos_admin_manage"
on public.servicos
for all
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "vendas_admin_select" on public.vendas;
create policy "vendas_admin_select"
on public.vendas
for select
using ((select public.is_admin()));

drop policy if exists "vendas_funcionario_select_proprio" on public.vendas;
create policy "vendas_funcionario_select_proprio"
on public.vendas
for select
using (usuario_id = (select auth.uid()));

drop policy if exists "vendas_admin_update" on public.vendas;
create policy "vendas_admin_update"
on public.vendas
for update
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "vendas_admin_insert" on public.vendas;
create policy "vendas_admin_insert"
on public.vendas
for insert
with check ((select public.is_admin()));

drop policy if exists "vendas_funcionario_insert_proprio" on public.vendas;
create policy "vendas_funcionario_insert_proprio"
on public.vendas
for insert
with check (usuario_id = (select auth.uid()));

drop policy if exists "vendas_admin_delete" on public.vendas;
create policy "vendas_admin_delete"
on public.vendas
for delete
using ((select public.is_admin()));

drop policy if exists "atendimentos_admin_select" on public.atendimentos;
create policy "atendimentos_admin_select"
on public.atendimentos
for select
using ((select public.is_admin()));

drop policy if exists "atendimentos_funcionario_select_proprio" on public.atendimentos;
create policy "atendimentos_funcionario_select_proprio"
on public.atendimentos
for select
using (usuario_id = (select auth.uid()));

drop policy if exists "atendimentos_funcionario_insert_proprio" on public.atendimentos;
create policy "atendimentos_funcionario_insert_proprio"
on public.atendimentos
for insert
with check (usuario_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "atendimentos_admin_delete" on public.atendimentos;
create policy "atendimentos_admin_delete"
on public.atendimentos
for delete
using ((select public.is_admin()));

drop policy if exists "gastos_admin_full_access" on public.gastos;
create policy "gastos_admin_full_access"
on public.gastos
for all
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "fechamentos_semanais_admin_todos" on public.fechamentos_semanais;
create policy "fechamentos_semanais_admin_todos"
on public.fechamentos_semanais
for select
using ((select public.is_admin()));

drop policy if exists "fechamentos_semanais_funcionario_proprio" on public.fechamentos_semanais;
create policy "fechamentos_semanais_funcionario_proprio"
on public.fechamentos_semanais
for select
using (usuario_id = (select auth.uid()));

drop policy if exists "fechamentos_semanais_admin_manage" on public.fechamentos_semanais;
create policy "fechamentos_semanais_admin_manage"
on public.fechamentos_semanais
for all
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "fechamentos_mensais_admin_only" on public.fechamentos_mensais;
create policy "fechamentos_mensais_admin_only"
on public.fechamentos_mensais
for all
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists "comissoes_pagamentos_admin_select" on public.comissoes_pagamentos;
create policy "comissoes_pagamentos_admin_select"
on public.comissoes_pagamentos
for select
using ((select public.is_admin()));

drop policy if exists "comissoes_pagamentos_funcionario_select_proprio" on public.comissoes_pagamentos;
create policy "comissoes_pagamentos_funcionario_select_proprio"
on public.comissoes_pagamentos
for select
using (usuario_id = (select auth.uid()));

drop policy if exists "comissoes_pagamentos_admin_manage" on public.comissoes_pagamentos;
create policy "comissoes_pagamentos_admin_manage"
on public.comissoes_pagamentos
for all
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- 5) RPC e triggers: remove execucao anon/public onde nao faz sentido (lint 0028/0029)
-- Internos / apenas trigger — nao devem ser chamados via PostgREST sem sessao util.
revoke all on function public.atendimento_before_insert() from public;
revoke all on function public.atendimento_before_insert() from anon;
revoke all on function public.atendimento_before_insert() from authenticated;

revoke all on function public.sync_venda_total_from_atendimentos() from public;
revoke all on function public.sync_venda_total_from_atendimentos() from anon;
revoke all on function public.sync_venda_total_from_atendimentos() from authenticated;

revoke all on function public.recalcular_comissao_venda(uuid) from public;
revoke all on function public.recalcular_comissao_venda(uuid) from anon;
revoke all on function public.recalcular_comissao_venda(uuid) from authenticated;

revoke all on function public.handle_auth_user_created() from public;
revoke all on function public.handle_auth_user_created() from anon;
revoke all on function public.handle_auth_user_created() from authenticated;

revoke all on function public.handle_auth_user_updated() from public;
revoke all on function public.handle_auth_user_updated() from anon;
revoke all on function public.handle_auth_user_updated() from authenticated;

-- RPCs de negocio: autenticados sim, anon nao; service_role mantem acesso padrao do projeto.
revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.registrar_atendimento(uuid, text, uuid, numeric, timestamptz) from public;
revoke all on function public.registrar_atendimento(uuid, text, uuid, numeric, timestamptz) from anon;
grant execute on function public.registrar_atendimento(uuid, text, uuid, numeric, timestamptz) to authenticated;

revoke all on function public.registrar_venda(uuid, text, timestamptz, jsonb) from public;
revoke all on function public.registrar_venda(uuid, text, timestamptz, jsonb) from anon;
grant execute on function public.registrar_venda(uuid, text, timestamptz, jsonb) to authenticated;

revoke all on function public.marcar_venda_pago(uuid, text, numeric, text, uuid) from public;
revoke all on function public.marcar_venda_pago(uuid, text, numeric, text, uuid) from anon;
grant execute on function public.marcar_venda_pago(uuid, text, numeric, text, uuid) to authenticated;

revoke all on function public.definir_status_usuario(uuid, boolean, boolean) from public;
revoke all on function public.definir_status_usuario(uuid, boolean, boolean) from anon;
grant execute on function public.definir_status_usuario(uuid, boolean, boolean) to authenticated;

revoke all on function public.excluir_venda_com_itens(uuid) from public;
revoke all on function public.excluir_venda_com_itens(uuid) from anon;
grant execute on function public.excluir_venda_com_itens(uuid) to authenticated;

revoke all on function public.resumo_semanal_por_funcionario(date, date) from public;
revoke all on function public.resumo_semanal_por_funcionario(date, date) from anon;
grant execute on function public.resumo_semanal_por_funcionario(date, date) to authenticated;

comment on table public.vendas is 'Cabecalho da comanda: pagamento e totais. Itens em atendimentos.venda_id.';
comment on table public.atendimentos is 'Itens de servico por venda; comissao de linha coerente com status da venda.';
comment on table public.comissoes_pagamentos is 'Auditoria 1:1 com fechamento semanal pago.';
