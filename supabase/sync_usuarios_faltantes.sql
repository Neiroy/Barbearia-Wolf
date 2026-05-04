-- Sincroniza auth.users -> public.usuarios para quem ainda nao tem linha.
-- Rode no SQL Editor quando criar usuario no Auth e o perfil nao aparecer na tabela.
-- Idempotente: nao duplica (where not exists).

insert into public.usuarios (
  id,
  nome,
  email,
  tipo,
  tipo_remuneracao,
  recebe_comissao,
  percentual_comissao,
  participa_fechamento_comissao,
  ativo,
  desativado_em,
  excluido_logico_em
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
  end as participa_fechamento_comissao,
  true,
  null,
  null
from auth.users au
where not exists (
  select 1
  from public.usuarios u
  where u.id = au.id
);
