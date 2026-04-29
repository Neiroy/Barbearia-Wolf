-- Vendas com status de pagamento + comissao apenas sobre servico pago (venda quitada)

-- 1) Tabela de vendas (agrupa atendimentos / comanda)
create table if not exists public.vendas (
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
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendas_usuario_data on public.vendas(usuario_id, data_hora desc);
create index if not exists idx_vendas_status on public.vendas(status_pagamento);

drop trigger if exists trg_vendas_set_updated_at on public.vendas;
create trigger trg_vendas_set_updated_at
before update on public.vendas
for each row execute function public.set_updated_at();

-- 2) Backfill: uma linha de venda por venda_id existente (legado = considerado ja pago)
insert into public.vendas (
  id,
  usuario_id,
  cliente_nome,
  data_hora,
  status_pagamento,
  forma_pagamento,
  valor_total,
  valor_pago,
  data_pagamento
)
select
  a.venda_id,
  (array_agg(a.usuario_id order by a.data_hora asc))[1] as usuario_id,
  max(a.cliente_nome) as cliente_nome,
  min(a.data_hora) as data_hora,
  'pago'::text as status_pagamento,
  null::text as forma_pagamento,
  coalesce(sum(a.valor_servico), 0)::numeric(10,2) as valor_total,
  coalesce(sum(a.valor_servico), 0)::numeric(10,2) as valor_pago,
  min(a.data_hora) as data_pagamento
from public.atendimentos a
group by a.venda_id
on conflict (id) do nothing;

-- 3) FK atendimentos -> vendas
alter table public.atendimentos
  drop constraint if exists atendimentos_venda_id_fkey;

alter table public.atendimentos
  add constraint atendimentos_venda_id_fkey
  foreign key (venda_id) references public.vendas(id) on delete restrict;

-- 4) Comissao na linha so quando a venda estiver paga
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
begin
  select id, valor, valor_editavel into v_servico
  from public.servicos
  where id = new.servico_id and ativo = true;

  if v_servico.id is null then
    raise exception 'Servico invalido ou inativo.';
  end if;

  select percentual_comissao, recebe_comissao
    into v_percentual, v_recebe_comissao
  from public.usuarios
  where id = new.usuario_id;

  if v_percentual is null or v_recebe_comissao is null then
    raise exception 'Funcionario invalido para comissao.';
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
begin
  if auth.uid() is null then
    raise exception 'Sessao invalida.';
  end if;
  if not public.is_admin() then
    raise exception 'Apenas administrador pode marcar pagamento da venda.';
  end if;

  select coalesce(sum(valor_servico), 0) into v_total
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
    atualizado_por = coalesce(p_marcado_por, auth.uid()),
    updated_at = now()
  where id = p_venda_id;

  if not found then
    raise exception 'Venda nao encontrada.';
  end if;

  perform public.recalcular_comissao_venda(p_venda_id);
end;
$$;

grant execute on function public.marcar_venda_pago(uuid, text, numeric, text, uuid) to authenticated;

-- 5) Registrar venda em lote: cria venda pendente e itens (comissao 0 ate pagar)
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

-- 6) Atendimento unico (compat): cria venda pendente + 1 linha
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

-- 7) Resumo semanal: realizado / recebido / pendente + comissao apenas sobre pago
drop function if exists public.resumo_semanal_por_funcionario(date, date);

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

-- 8) Fechamentos semanais: totais financeiros por semana
alter table public.fechamentos_semanais
  add column if not exists total_recebido numeric(10,2) not null default 0,
  add column if not exists total_pendente numeric(10,2) not null default 0;

update public.fechamentos_semanais f
set
  total_recebido = coalesce(s.total_recebido, 0),
  total_pendente = coalesce(s.total_pendente, 0)
from (
  select
    a.usuario_id,
    f2.semana_inicio,
    f2.semana_fim,
    coalesce(sum(case when v.status_pagamento = 'pago' then a.valor_servico else 0 end), 0)::numeric(10,2) as total_recebido,
    coalesce(
      sum(case when v.status_pagamento in ('pendente', 'parcial') then a.valor_servico else 0 end),
      0
    )::numeric(10,2) as total_pendente
  from public.fechamentos_semanais f2
  join public.atendimentos a
    on a.usuario_id = f2.usuario_id
   and a.data_hora >= (f2.semana_inicio::timestamptz)
   and a.data_hora < ((f2.semana_fim + 1)::timestamptz)
  join public.vendas v on v.id = a.venda_id
  join public.usuarios u on u.id = a.usuario_id
  where u.recebe_comissao = true
    and u.participa_fechamento_comissao = true
  group by a.usuario_id, f2.semana_inicio, f2.semana_fim
) s
where f.usuario_id = s.usuario_id
  and f.semana_inicio = s.semana_inicio
  and f.semana_fim = s.semana_fim;

-- 9) Fechamento mensal: recebido x pendente no snapshot
alter table public.fechamentos_mensais
  add column if not exists total_recebido numeric(10,2) not null default 0,
  add column if not exists total_pendente numeric(10,2) not null default 0;

-- 10) Historico de pagamento de comissao semanal (snapshot operacional)
alter table public.comissoes_pagamentos
  add column if not exists snapshot_total_realizado numeric(10,2),
  add column if not exists snapshot_total_recebido numeric(10,2),
  add column if not exists snapshot_total_pendente numeric(10,2);

-- 11) RLS vendas
alter table public.vendas enable row level security;

drop policy if exists "vendas_admin_select" on public.vendas;
create policy "vendas_admin_select"
on public.vendas
for select
using (public.is_admin());

drop policy if exists "vendas_funcionario_select_proprio" on public.vendas;
create policy "vendas_funcionario_select_proprio"
on public.vendas
for select
using (usuario_id = auth.uid());

drop policy if exists "vendas_admin_update" on public.vendas;
create policy "vendas_admin_update"
on public.vendas
for update
using (public.is_admin())
with check (public.is_admin());
