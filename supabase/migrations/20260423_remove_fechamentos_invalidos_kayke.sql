-- Remove snapshots semanais invalidos informados pelo admin (Kayke)
-- Periodos removidos:
-- - 31/03/2026 a 04/04/2026
-- - 07/04/2026 a 11/04/2026

delete from public.fechamentos_semanais fs
using public.usuarios u
where u.id = fs.usuario_id
  and lower(u.nome) = 'kayke'
  and (
    (fs.semana_inicio = date '2026-03-31' and fs.semana_fim = date '2026-04-04')
    or (fs.semana_inicio = date '2026-04-07' and fs.semana_fim = date '2026-04-11')
  );
