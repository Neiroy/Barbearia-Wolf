-- Corrige erro de RLS ao registrar atendimento/venda
-- Erro observado: new row violates row-level security policy for table "vendas"

alter table public.vendas enable row level security;

drop policy if exists "vendas_admin_insert" on public.vendas;
create policy "vendas_admin_insert"
on public.vendas
for insert
with check (public.is_admin());

drop policy if exists "vendas_funcionario_insert_proprio" on public.vendas;
create policy "vendas_funcionario_insert_proprio"
on public.vendas
for insert
with check (usuario_id = auth.uid());
