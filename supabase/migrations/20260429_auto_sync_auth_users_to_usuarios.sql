-- Sincroniza automaticamente usuarios do Supabase Auth para public.usuarios.
-- Objetivo: ao criar login no Auth, o perfil interno ja nasce pronto.

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_auth_user_created();

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

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email on auth.users
for each row execute function public.handle_auth_user_updated();

-- Backfill para usuarios do Auth que ainda nao tenham perfil em public.usuarios.
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
select
  au.id,
  coalesce(nullif(btrim(au.raw_user_meta_data ->> 'nome'), ''), split_part(au.email, '@', 1)) as nome,
  au.email,
  case
    when lower(coalesce(au.raw_user_meta_data ->> 'tipo', 'funcionario')) in ('admin', 'funcionario')
      then lower(coalesce(au.raw_user_meta_data ->> 'tipo', 'funcionario'))
    else 'funcionario'
  end as tipo,
  case
    when lower(coalesce(au.raw_user_meta_data ->> 'tipo_remuneracao', 'comissionado')) in ('dono', 'comissionado', 'fixo')
      then lower(coalesce(au.raw_user_meta_data ->> 'tipo_remuneracao', 'comissionado'))
    when lower(coalesce(au.raw_user_meta_data ->> 'tipo', 'funcionario')) = 'admin'
      then 'dono'
    else 'comissionado'
  end as tipo_remuneracao,
  case
    when lower(coalesce(au.raw_user_meta_data ->> 'tipo', 'funcionario')) = 'admin'
      then false
    else coalesce(nullif(au.raw_user_meta_data ->> 'recebe_comissao', '')::boolean, true)
  end as recebe_comissao,
  case
    when lower(coalesce(au.raw_user_meta_data ->> 'tipo', 'funcionario')) = 'admin'
      then 0
    when coalesce(nullif(au.raw_user_meta_data ->> 'recebe_comissao', '')::boolean, true) = false
      then 0
    else greatest(coalesce(nullif(au.raw_user_meta_data ->> 'percentual_comissao', '')::numeric, 40), 0)
  end as percentual_comissao,
  case
    when lower(coalesce(au.raw_user_meta_data ->> 'tipo', 'funcionario')) = 'admin'
      then false
    else coalesce(nullif(au.raw_user_meta_data ->> 'participa_fechamento_comissao', '')::boolean, true)
  end as participa_fechamento_comissao
from auth.users au
where not exists (
  select 1
  from public.usuarios u
  where u.id = au.id
);
