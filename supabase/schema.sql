-- ============================================================
-- BARBEARIA WOLF - RESET TOTAL E RECRIACAO DO BANCO (PUBLIC)
-- Execute este arquivo para recriar toda a estrutura do zero.
--
-- IMPORTANTE:
-- - Este script nao cria usuarios no auth.users.
-- - Crie os usuarios no painel Auth e depois rode novamente para sincronizar.
-- ============================================================

create extension if not exists "pgcrypto";

-- =========================
-- LIMPEZA COMPLETA (PUBLIC)
-- =========================
drop table if exists public.fechamentos_mensais cascade;
drop table if exists public.fechamentos_semanais cascade;
drop table if exists public.gastos cascade;
drop table if exists public.atendimentos cascade;
drop table if exists public.servicos cascade;
drop table if exists public.usuarios cascade;
drop function if exists public.is_admin();

-- =========================
-- CRIACAO DAS TABELAS
-- =========================
create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text unique not null,
  tipo text not null check (tipo in ('admin', 'funcionario')),
  percentual_comissao numeric(5,2) not null default 40,
  created_at timestamptz not null default now()
);

create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  valor numeric(10,2) not null check (valor >= 0),
  valor_editavel boolean not null default false,
  ordem integer not null default 999,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.atendimentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete restrict,
  cliente_nome text not null,
  servico_id uuid not null references public.servicos(id) on delete restrict,
  valor_servico numeric(10,2) not null check (valor_servico >= 0),
  percentual_comissao numeric(5,2) not null check (percentual_comissao >= 0),
  valor_comissao numeric(10,2) not null check (valor_comissao >= 0),
  data_hora timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  tipo text not null check (tipo in ('fixo', 'variavel', 'produto', 'manutencao', 'operacao', 'outros')),
  valor numeric(10,2) not null check (valor >= 0),
  data date not null default current_date,
  criado_por uuid not null references public.usuarios(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.fechamentos_semanais (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  semana_inicio date not null,
  semana_fim date not null,
  total_servicos integer not null default 0,
  total_vendido numeric(10,2) not null default 0,
  total_comissao numeric(10,2) not null default 0,
  status_pagamento text not null default 'aberto' check (status_pagamento in ('aberto', 'pago')),
  created_at timestamptz not null default now(),
  unique (usuario_id, semana_inicio, semana_fim)
);

create table public.fechamentos_mensais (
  id uuid primary key default gen_random_uuid(),
  referencia_mes date not null,
  total_entradas numeric(10,2) not null default 0,
  total_gastos numeric(10,2) not null default 0,
  total_comissoes numeric(10,2) not null default 0,
  lucro_bruto numeric(10,2) not null default 0,
  lucro_liquido numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (referencia_mes)
);

-- Regra de negocio: permitir multiplos funcionarios (sem restricao de nome)

-- =========================
-- SEED DE SERVICOS
-- =========================
insert into public.servicos (nome, valor, valor_editavel, ordem, ativo)
values
  ('Degradê', 35.00, false, 1, true),
  ('Social', 30.00, false, 2, true),
  ('Barba Simples', 20.00, false, 3, true),
  ('Barba Detalhada', 25.00, false, 4, true),
  ('Sobrancelha', 6.00, false, 5, true),
  ('Pigmentação', 20.00, false, 6, true),
  ('Luzes', 60.00, true, 7, true),
  ('Platinado', 120.00, true, 8, true),
  ('Degradê + Barba Detalhada', 55.00, false, 9, true),
  ('Degradê + Barba Simples', 50.00, false, 10, true),
  ('Social + Barba Simples', 45.00, false, 11, true),
  ('Limpeza de pele', 35.00, false, 12, true),
  ('Pelo na cera', 15.00, false, 13, true);

-- =========================
-- SINCRONIZACAO AUTH -> USUARIOS
-- Rode o script novamente apos criar os usuarios no Auth.
-- =========================
do $$
declare
  admin_uid uuid;
  funcionario_uid uuid;
begin
  select id into admin_uid
  from auth.users
  where email = 'gabrielr@barbeariawolf.com'
  limit 1;

  if admin_uid is not null then
    insert into public.usuarios (id, nome, email, tipo, percentual_comissao)
    values (admin_uid, 'gabrielr', 'gabrielr@barbeariawolf.com', 'admin', 100)
    on conflict (id) do update
    set nome = excluded.nome,
        email = excluded.email,
        tipo = excluded.tipo,
        percentual_comissao = excluded.percentual_comissao;
  end if;

  select id into funcionario_uid
  from auth.users
  where email = 'kayke@barbeariawolf.com'
  limit 1;

  if funcionario_uid is not null then
    insert into public.usuarios (id, nome, email, tipo, percentual_comissao)
    values (funcionario_uid, 'kayke', 'kayke@barbeariawolf.com', 'funcionario', 40)
    on conflict (id) do update
    set nome = excluded.nome,
        email = excluded.email,
        tipo = excluded.tipo,
        percentual_comissao = excluded.percentual_comissao;
  end if;
end
$$;

-- =========================
-- FUNCOES DE NEGOCIO
-- =========================
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
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda precisa conter ao menos um servico.';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
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
      (v_item->>'servico_id')::uuid,
      coalesce((v_item->>'valor_informado')::numeric, 0),
      0,
      0,
      coalesce(p_data_hora, now())
    );
  end loop;

  return v_venda_id;
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
  group by a.usuario_id, u.nome;
$$;

-- =========================
-- RLS E POLICIES
-- =========================
alter table public.usuarios enable row level security;
alter table public.servicos enable row level security;
alter table public.atendimentos enable row level security;
alter table public.gastos enable row level security;
alter table public.fechamentos_semanais enable row level security;
alter table public.fechamentos_mensais enable row level security;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios
    where id = auth.uid()
      and tipo = 'admin'
  );
$$;

create policy "usuarios_admin_ou_proprio_select"
on public.usuarios
for select
using (public.is_admin() or id = auth.uid());

create policy "usuarios_admin_update"
on public.usuarios
for update
using (public.is_admin());

create policy "usuarios_admin_insert"
on public.usuarios
for insert
with check (public.is_admin());

create policy "usuarios_admin_delete"
on public.usuarios
for delete
using (public.is_admin());

create policy "servicos_select_todos_logados"
on public.servicos
for select
using (auth.uid() is not null);

create policy "servicos_admin_manage"
on public.servicos
for all
using (public.is_admin())
with check (public.is_admin());

create policy "atendimentos_admin_select"
on public.atendimentos
for select
using (public.is_admin());

create policy "atendimentos_funcionario_select_proprio"
on public.atendimentos
for select
using (usuario_id = auth.uid());

create policy "atendimentos_funcionario_insert_proprio"
on public.atendimentos
for insert
with check (usuario_id = auth.uid() or public.is_admin());

create policy "atendimentos_admin_delete"
on public.atendimentos
for delete
using (public.is_admin());

create policy "gastos_admin_full_access"
on public.gastos
for all
using (public.is_admin())
with check (public.is_admin());

create policy "fechamentos_semanais_admin_todos"
on public.fechamentos_semanais
for select
using (public.is_admin());

create policy "fechamentos_semanais_funcionario_proprio"
on public.fechamentos_semanais
for select
using (usuario_id = auth.uid());

create policy "fechamentos_semanais_admin_manage"
on public.fechamentos_semanais
for all
using (public.is_admin())
with check (public.is_admin());

create policy "fechamentos_mensais_admin_only"
on public.fechamentos_mensais
for all
using (public.is_admin())
with check (public.is_admin());
