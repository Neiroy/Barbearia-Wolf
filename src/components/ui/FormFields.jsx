export function FormField({ label, children, hint }) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {hint ? <small className="text-xs text-slate-500">{hint}</small> : null}
    </label>
  )
}

export function SelectField({ label, value, onChange, options, placeholder, required = false }) {
  return (
    <FormField label={label}>
      <select
        className="input"
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder || 'Selecione'}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  )
}
