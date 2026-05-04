-- ============================================================
-- BARBEARIA WOLF - RESET TOTAL E RECRIACAO DO BANCO (PUBLIC)
-- Snapshot consolidado das migrations em supabase/migrations/.
-- Execute no SQL Editor do Supabase (ou psql com extensao auth).
--
-- IMPORTANTE:
-- - Nao cria usuarios em auth.users; crie no painel Auth.
-- - Triggers em auth.users exigem permissao no projeto Supabase.
-- ============================================================

create extension if not exists "pgcrypto";

-- =========================
-- LIMPEZA (AUTH + PUBLIC)
-- =========================
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_updated on auth.users;

drop table if exists public.comissoes_pagamentos cascade;
drop table if exists public.fechamentos_semanais cascade;
drop table if exists public.fechamentos_mensais cascade;
drop table if exists public.gastos cascade;
drop table if exists public.atendimentos cascade;
drop table if exists public.vendas cascade;
drop table if exists public.servicos cascade;
drop table if exists public.usuarios cascade;

-- =========================
-- TABELAS
-- =========================
create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text unique not null,
  tipo text not null check (tipo in ('admin', 'funcionario')),
  tipo_remuneracao text not null default 'comissionado' check (tipo_remuneracao in ('dono', 'comissionado', 'fixo')),
  recebe_comissao boolean not null default true,
  percentual_comissao numeric(5,2) not null default 40,
  participa_fechamento_comissao boolean not null default true,
  ativo boolean not null default true,
  desativado_em timestamptz,
  excluido_logico_em timestamptz,
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

create table public.vendas (
  id uuid primary key,
  usuario_id uuid not null references public.usuarios(id) on delete restrict,
  cliente_nome text not null,
  data_hora timestamptz not null default now(),
  status_pagamento text not null default 'pendente'
    check (status_pagamento in ('pendente', 'pago', 'parcial', 'cancelado')),
  forma_pagamento text,
  valor_total numeric(10,2) not null default 0 check (valor_total >= 0),
  valor_pago numeric(10,2) not null default 0 check (valor_pago >= 0),
  data_pagamento timestamptz,
  observacao_pagamento text,
  atualizado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendas_valor_pago_nao_supera_total check (valor_pago <= valor_total)
);

create index idx_vendas_usuario_data on public.vendas(usuario_id, data_hora desc);
create index idx_vendas_status on public.vendas(status_pagamento);
create index idx_vendas_usuario_status on public.vendas(usuario_id, status_pagamento);

create table public.atendimentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id) on delete restrict,
  usuario_id uuid not null references public.usuarios(id) on delete restrict,
  cliente_nome text not null,
  servico_id uuid not null references public.servicos(id) on delete restrict,
  valor_servico numeric(10,2) not null check (valor_servico >= 0),
  percentual_comissao numeric(5,2) not null check (percentual_comissao >= 0),
  valor_comissao numeric(10,2) not null check (valor_comissao >= 0),
  data_hora timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_atendimentos_venda_id on public.atendimentos(venda_id);
create index idx_atendimentos_usuario_data_hora on public.atendimentos(usuario_id, data_hora desc);
create index idx_atendimentos_data_hora on public.atendimentos(data_hora desc);

create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  tipo text not null check (tipo in ('fixo', 'variavel', 'produto', 'manutencao', 'operacao', 'outros')),
  valor numeric(10,2) not null check (valor >= 0),
  recorrente_mensal boolean not null default false,
  origem_recorrente_id uuid null references public.gastos(id) on delete set null,
  competencia_mes date not null default date_trunc('month', current_date)::date,
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
  total_recebido numeric(10,2) not null default 0,
  total_pendente numeric(10,2) not null default 0,
  total_comissao numeric(10,2) not null default 0,
  status_pagamento text not null default 'aberto' check (status_pagamento in ('aberto', 'pago')),
  pago_em timestamptz,
  fechado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fechamentos_semanais_semana_inicio_check check (extract(dow from semana_inicio) = 2),
  constraint fechamentos_semanais_semana_fim_check check (extract(dow from semana_fim) = 6),
  unique (usuario_id, semana_inicio, semana_fim)
);

create table public.fechamentos_mensais (
  id uuid primary key default gen_random_uuid(),
  referencia_mes date not null,
  mes integer,
  ano integer,
  data_inicio date,
  data_fim date,
  total_entradas numeric(10,2) not null default 0,
  total_recebido numeric(10,2) not null default 0,
  total_pendente numeric(10,2) not null default 0,
  total_gastos numeric(10,2) not null default 0,
  total_comissoes numeric(10,2) not null default 0,
  faturamento_equipe numeric(10,2) not null default 0,
  faturamento_admin numeric(10,2) not null default 0,
  comissao_paga numeric(10,2) not null default 0,
  comissao_pendente numeric(10,2) not null default 0,
  lucro_bruto numeric(10,2) not null default 0,
  lucro_liquido numeric(10,2) not null default 0,
  status_fechamento text not null default 'aberto' check (status_fechamento in ('aberto', 'fechado')),
  fechado_em timestamptz,
  fechado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (referencia_mes)
);

create table public.comissoes_pagamentos (
  id uuid primary key default gen_random_uuid(),
  fechamento_semanal_id uuid not null unique references public.fechamentos_semanais(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  semana_inicio date not null,
  semana_fim date not null,
  valor_pago numeric(10,2) not null default 0 check (valor_pago >= 0),
  pago_em timestamptz not null default now(),
  marcado_por uuid references public.usuarios(id) on delete set null,
  status_registro text not null default 'pago' check (status_registro in ('pago', 'reaberto')),
  snapshot_total_realizado numeric(10,2),
  snapshot_total_recebido numeric(10,2),
  snapshot_total_pendente numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extract(dow from semana_inicio) = 2),
  check (extract(dow from semana_fim) = 6)
);

create index idx_comissoes_pagamentos_usuario_periodo
  on public.comissoes_pagamentos(usuario_id, semana_inicio desc);
create index idx_comissoes_pagamentos_pago_em
  on public.comissoes_pagamentos(pago_em desc);

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
-- SINCRONIZACAO AUTH -> USUARIOS (manual apos criar logins)
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
    insert into public.usuarios (
      id,
      nome,
      email,
      tipo,
      tipo_remuneracao,
      recebe_comissao,
      percentual_comissao,
      participa_fechamento_comissao
    )
    values (admin_uid, 'gabrielr', 'gabrielr@barbeariawolf.com', 'admin', 'dono', false, 0, false)
    on conflict (id) do update
    set nome = excluded.nome,
        email = excluded.email,
        tipo = excluded.tipo,
        tipo_remuneracao = excluded.tipo_remuneracao,
        recebe_comissao = excluded.recebe_comissao,
        percentual_comissao = excluded.percentual_comissao,
        participa_fechamento_comissao = excluded.participa_fechamento_comissao;
  end if;

  select id into funcionario_uid
  from auth.users
  where email = 'kayke@barbeariawolf.com'
  limit 1;

  if funcionario_uid is not null then
    insert into public.usuarios (
      id,
      nome,
      email,
      tipo,
      tipo_remuneracao,
      recebe_comissao,
      percentual_comissao,
      participa_fechamento_comissao
    )
    values (funcionario_uid, 'kayke', 'kayke@barbeariawolf.com', 'funcionario', 'comissionado', true, 40, true)
    on conflict (id) do update
    set nome = excluded.nome,
        email = excluded.email,
        tipo = excluded.tipo,
        tipo_remuneracao = excluded.tipo_remuneracao,
        recebe_comissao = excluded.recebe_comissao,
        percentual_comissao = excluded.percentual_comissao,
        participa_fechamento_comissao = excluded.participa_fechamento_comissao;
  end if;
end
$$;

-- =========================
-- FUNCOES AUXILIARES
-- =========================
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

create or replace function public.is_admin()
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

-- =========================
-- VENDAS: total sincronizado com itens
-- =========================
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

-- =========================
-- ATENDIMENTOS: validacao e comissao (somente venda paga)
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

create or replace function public.recalcular_comissao_venda(p_venda_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status_pagamento into v_status from public.vendas where id = p_venda_id;
  if v_status is null then
    return;
  end if;

  update public.atendimentos a
  set valor_comissao = case
    when v_status = 'pago' and u.recebe_comissao then round((a.valor_servico * a.percentual_comissao) / 100, 2)
    else 0
  end
  from public.usuarios u
  where a.usuario_id = u.id
    and a.venda_id = p_venda_id;
end;
$$;

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
  v_venda_id uuid := gen_random_uuid();
  v_id uuid;
begin
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
    p_servico_id,
    coalesce(p_valor_informado, 0),
    0,
    0,
    coalesce(p_data_hora, now())
  )
  returning id into v_id;

  update public.vendas
  set valor_total = (
    select coalesce(sum(valor_servico), 0)
    from public.atendimentos
    where venda_id = v_venda_id
  )
  where id = v_venda_id;

  return v_id;
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
  total_recebido numeric,
  total_pendente numeric,
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
    coalesce(sum(case when v.status_pagamento = 'pago' then a.valor_servico else 0 end), 0)::numeric as total_recebido,
    coalesce(
      sum(
        case
          when v.status_pagamento in ('pendente', 'parcial') then a.valor_servico
          else 0
        end
      ),
      0
    )::numeric as total_pendente,
    coalesce(sum(a.valor_comissao), 0)::numeric as total_comissao
  from public.atendimentos a
  join public.vendas v on v.id = a.venda_id
  join public.usuarios u on u.id = a.usuario_id
  where a.data_hora >= (p_inicio::timestamptz)
    and a.data_hora < ((p_fim + 1)::timestamptz)
    and extract(dow from a.data_hora at time zone 'utc') between 2 and 6
    and u.recebe_comissao = true
    and u.participa_fechamento_comissao = true
  group by a.usuario_id, u.nome;
$$;

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

-- =========================
-- AUTH: perfil automatico
-- =========================
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_tipo text;
  v_tipo_remuneracao text;
  v_recebe_comissao boolean;
  v_percentual_comissao numeric(5,2);
  v_participa_fechamento boolean;
begin
  v_nome := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'nome', '')), '');
  v_tipo := lower(coalesce(new.raw_user_meta_data ->> 'tipo', 'funcionario'));
  v_tipo_remuneracao := lower(coalesce(new.raw_user_meta_data ->> 'tipo_remuneracao', 'comissionado'));
  v_recebe_comissao := coalesce(nullif(new.raw_user_meta_data ->> 'recebe_comissao', '')::boolean, true);
  v_percentual_comissao := coalesce(nullif(new.raw_user_meta_data ->> 'percentual_comissao', '')::numeric, 40);
  v_participa_fechamento := coalesce(nullif(new.raw_user_meta_data ->> 'participa_fechamento_comissao', '')::boolean, true);

  if v_nome is null then
    v_nome := split_part(new.email, '@', 1);
  end if;

  if v_tipo not in ('admin', 'funcionario') then
    v_tipo := 'funcionario';
  end if;

  if v_tipo_remuneracao not in ('dono', 'comissionado', 'fixo') then
    v_tipo_remuneracao := case when v_tipo = 'admin' then 'dono' else 'comissionado' end;
  end if;

  if v_tipo = 'admin' then
    v_recebe_comissao := false;
    v_percentual_comissao := 0;
    v_participa_fechamento := false;
  else
    if not v_recebe_comissao then
      v_percentual_comissao := 0;
    end if;
  end if;

  insert into public.usuarios (
    id,
    nome,
    email,
    tipo,
    tipo_remuneracao,
    recebe_comissao,
    percentual_comissao,
    participa_fechamento_comissao
  )
  values (
    new.id,
    v_nome,
    new.email,
    v_tipo,
    v_tipo_remuneracao,
    v_recebe_comissao,
    greatest(v_percentual_comissao, 0),
    v_participa_fechamento
  )
  on conflict (id) do update
  set
    email = excluded.email,
    nome = coalesce(nullif(btrim(public.usuarios.nome), ''), excluded.nome);

  return new;
end;
$$;

create or replace function public.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.usuarios
  set email = new.email
  where id = new.id
    and email is distinct from new.email;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_auth_user_created();

create trigger on_auth_user_updated
after update of email on auth.users
for each row execute function public.handle_auth_user_updated();

-- =========================
-- TRIGGERS DE NEGOCIO
-- =========================
drop trigger if exists trg_atendimento_before_insert on public.atendimentos;
create trigger trg_atendimento_before_insert
before insert on public.atendimentos
for each row execute function public.atendimento_before_insert();

drop trigger if exists trg_sync_venda_total_from_atendimentos on public.atendimentos;
create trigger trg_sync_venda_total_from_atendimentos
after insert or update of valor_servico, venda_id or delete
on public.atendimentos
for each row execute function public.sync_venda_total_from_atendimentos();

drop trigger if exists trg_vendas_set_updated_at on public.vendas;
create trigger trg_vendas_set_updated_at
before update on public.vendas
for each row execute function public.set_updated_at();

drop trigger if exists trg_fechamentos_semanais_set_updated_at on public.fechamentos_semanais;
create trigger trg_fechamentos_semanais_set_updated_at
before update on public.fechamentos_semanais
for each row execute function public.set_updated_at();

drop trigger if exists trg_fechamentos_mensais_set_updated_at on public.fechamentos_mensais;
create trigger trg_fechamentos_mensais_set_updated_at
before update on public.fechamentos_mensais
for each row execute function public.set_updated_at();

drop trigger if exists trg_comissoes_pagamentos_set_updated_at on public.comissoes_pagamentos;
create trigger trg_comissoes_pagamentos_set_updated_at
before update on public.comissoes_pagamentos
for each row execute function public.set_updated_at();

-- =========================
-- RLS E POLICIES
-- =========================
alter table public.usuarios enable row level security;
alter table public.servicos enable row level security;
alter table public.vendas enable row level security;
alter table public.atendimentos enable row level security;
alter table public.gastos enable row level security;
alter table public.fechamentos_semanais enable row level security;
alter table public.fechamentos_mensais enable row level security;
alter table public.comissoes_pagamentos enable row level security;

create policy "usuarios_admin_ou_proprio_select"
on public.usuarios
for select
using ((select public.is_admin()) or id = (select auth.uid()));

create policy "usuarios_admin_update"
on public.usuarios
for update
using ((select public.is_admin()));

create policy "usuarios_admin_insert"
on public.usuarios
for insert
with check ((select public.is_admin()));

create policy "usuarios_admin_delete"
on public.usuarios
for delete
using ((select public.is_admin()));

create policy "servicos_select_todos_logados"
on public.servicos
for select
using ((select auth.uid()) is not null);

create policy "servicos_admin_manage"
on public.servicos
for all
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "vendas_admin_select"
on public.vendas
for select
using ((select public.is_admin()));

create policy "vendas_funcionario_select_proprio"
on public.vendas
for select
using (usuario_id = (select auth.uid()));

create policy "vendas_admin_update"
on public.vendas
for update
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "vendas_admin_insert"
on public.vendas
for insert
with check ((select public.is_admin()));

create policy "vendas_funcionario_insert_proprio"
on public.vendas
for insert
with check (usuario_id = (select auth.uid()));

create policy "vendas_admin_delete"
on public.vendas
for delete
using ((select public.is_admin()));

create policy "atendimentos_admin_select"
on public.atendimentos
for select
using ((select public.is_admin()));

create policy "atendimentos_funcionario_select_proprio"
on public.atendimentos
for select
using (usuario_id = (select auth.uid()));

create policy "atendimentos_funcionario_insert_proprio"
on public.atendimentos
for insert
with check (usuario_id = (select auth.uid()) or (select public.is_admin()));

create policy "atendimentos_admin_delete"
on public.atendimentos
for delete
using ((select public.is_admin()));

create policy "gastos_admin_full_access"
on public.gastos
for all
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "fechamentos_semanais_admin_todos"
on public.fechamentos_semanais
for select
using ((select public.is_admin()));

create policy "fechamentos_semanais_funcionario_proprio"
on public.fechamentos_semanais
for select
using (usuario_id = (select auth.uid()));

create policy "fechamentos_semanais_admin_manage"
on public.fechamentos_semanais
for all
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "fechamentos_mensais_admin_only"
on public.fechamentos_mensais
for all
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "comissoes_pagamentos_admin_select"
on public.comissoes_pagamentos
for select
using ((select public.is_admin()));

create policy "comissoes_pagamentos_funcionario_select_proprio"
on public.comissoes_pagamentos
for select
using (usuario_id = (select auth.uid()));

create policy "comissoes_pagamentos_admin_manage"
on public.comissoes_pagamentos
for all
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- Permissoes de execucao: anon nao chama RPC internas; triggers nao expostas ao PostgREST.
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
