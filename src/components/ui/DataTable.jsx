export function DataTable({ columns, rows, empty }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-slate-400">
          {empty ?? 'Nenhum dado encontrado para o filtro aplicado.'}
        </div>
      ) : (
        <>
          <div className="space-y-3 p-3 sm:hidden">
            {rows.map((row) => (
              <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="space-y-2">
                  {columns.map((column) => (
                    <div key={`${row.id}-${column.key}`} className="flex items-start justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">{column.label}</p>
                      <div className="text-right text-sm text-slate-100">
                        {column.render ? column.render(row) : row[column.key]}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-950 text-slate-300">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className="px-3 py-2 text-xs font-medium uppercase tracking-wide lg:px-4 lg:py-3">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800 transition hover:bg-sky-500/5">
                    {columns.map((column) => (
                      <td key={`${row.id}-${column.key}`} className="px-3 py-2 text-slate-100 lg:px-4 lg:py-3">
                        {column.render ? column.render(row) : row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      </div>
  )
}
