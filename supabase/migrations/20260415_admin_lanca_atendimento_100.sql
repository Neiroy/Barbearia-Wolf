-- Admin tambem pode lancar atendimento e deve receber 100% no proprio servico

update public.usuarios
set percentual_comissao = 100
where tipo = 'admin';

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
