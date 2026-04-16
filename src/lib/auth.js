export function normalizeRole(tipo) {
  return (tipo ?? '').toString().trim().toLowerCase()
}
