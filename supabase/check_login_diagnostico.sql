-- ============================================================
-- DIAGNOSTICO COMPLETO - LOGIN / AUTH / RLS / PERFIS
-- Rode no SQL Editor do Supabase e analise os resultados.
-- ============================================================

-- 1) Usuarios no Auth
select
  id,
  email,
  email_confirmed_at,
  banned_until,
  deleted_at,
  last_sign_in_at
from auth.users
where email in ('gabrielr@barbeariawolf.com', 'kayke@barbeariawolf.com')
order by email;

-- 2) Identidades de login (provider email)
select
  u.email as auth_email,
  i.provider,
  i.provider_id,
  i.identity_data
from auth.users u
left join auth.identities i on i.user_id = u.id
where u.email in ('gabrielr@barbeariawolf.com', 'kayke@barbeariawolf.com')
order by u.email;

-- 3) Perfis em public.usuarios
select
  id,
  nome,
  email,
  tipo,
  percentual_comissao,
  created_at
from public.usuarios
where email in ('gabrielr@barbeariawolf.com', 'kayke@barbeariawolf.com')
order by email;

-- 4) Verificar correspondencia auth.users <-> public.usuarios
select
  u.email as auth_email,
  pu.email as perfil_email,
  u.id as auth_id,
  pu.id as perfil_id,
  case when u.id = pu.id then 'OK' else 'ERRO_ID_DIFERENTE' end as status_ids
from auth.users u
left join public.usuarios pu on pu.email = u.email
where u.email in ('gabrielr@barbeariawolf.com', 'kayke@barbeariawolf.com')
order by u.email;

-- 5) Policies ativas por tabela
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'usuarios',
    'servicos',
    'atendimentos',
    'gastos',
    'fechamentos_semanais',
    'fechamentos_mensais'
  )
order by tablename, policyname;

-- 6) Funcao de permissao admin
select
  p.proname as function_name,
  p.prosecdef as security_definer_enabled,
  n.nspname as schema_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'is_admin';

-- 7) Servicos cadastrados (seed)
select
  nome,
  valor,
  valor_editavel,
  ordem,
  ativo
from public.servicos
order by ordem, nome;

-- 8) Sanidade do negocio (apenas 1 funcionario com nome kayke)
select
  count(*) as total_funcionarios
from public.usuarios
where tipo = 'funcionario';

select
  id,
  nome,
  email,
  tipo
from public.usuarios
where tipo = 'funcionario';
