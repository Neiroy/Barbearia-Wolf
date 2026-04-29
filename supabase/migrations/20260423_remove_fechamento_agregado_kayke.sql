-- Remove fechamento agregado invalido (duas semanas somadas) do Kayke
-- Mantem apenas semanas separadas no historico.

delete from public.fechamentos_semanais fs
using public.usuarios u
where u.id = fs.usuario_id
  and lower(u.nome) = 'kayke'
  and fs.semana_inicio = date '2026-04-14'
  and fs.semana_fim = date '2026-04-25';
