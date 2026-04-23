-- Recalcula fechamento semanal do Kayke para semana 14/04/2026 a 18/04/2026
-- usando atendimentos do periodo solicitado: 16/04/2026 a 18/04/2026.

with alvo as (
  select id as usuario_id
  from public.usuarios
  where lower(nome) = 'kayke'
  limit 1
),
status_atual as (
  select
    fs.usuario_id,
    fs.status_pagamento,
    fs.pago_em,
    fs.fechado_por
  from public.fechamentos_semanais fs
  join alvo a on a.usuario_id = fs.usuario_id
  where fs.semana_inicio = date '2026-04-14'
    and fs.semana_fim = date '2026-04-18'
  limit 1
),
resumo as (
  select
    a.usuario_id,
    count(distinct at.venda_id) as total_servicos,
    coalesce(sum(at.valor_servico), 0)::numeric(10,2) as total_vendido,
    coalesce(sum(at.valor_comissao), 0)::numeric(10,2) as total_comissao
  from alvo a
  left join public.atendimentos at
    on at.usuario_id = a.usuario_id
   and at.data_hora >= timestamptz '2026-04-16 00:00:00+00'
   and at.data_hora <= timestamptz '2026-04-18 23:59:59+00'
  group by a.usuario_id
)
insert into public.fechamentos_semanais (
  usuario_id,
  semana_inicio,
  semana_fim,
  total_servicos,
  total_vendido,
  total_comissao,
  status_pagamento,
  pago_em,
  fechado_por
)
select
  r.usuario_id,
  date '2026-04-14' as semana_inicio,
  date '2026-04-18' as semana_fim,
  r.total_servicos::int,
  r.total_vendido,
  r.total_comissao,
  coalesce(s.status_pagamento, 'aberto') as status_pagamento,
  s.pago_em,
  s.fechado_por
from resumo r
left join status_atual s on s.usuario_id = r.usuario_id
on conflict (usuario_id, semana_inicio, semana_fim)
do update
set
  total_servicos = excluded.total_servicos,
  total_vendido = excluded.total_vendido,
  total_comissao = excluded.total_comissao,
  status_pagamento = coalesce(public.fechamentos_semanais.status_pagamento, excluded.status_pagamento),
  pago_em = coalesce(public.fechamentos_semanais.pago_em, excluded.pago_em),
  fechado_por = coalesce(public.fechamentos_semanais.fechado_por, excluded.fechado_por);
