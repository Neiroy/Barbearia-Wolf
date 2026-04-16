import { ChevronDown } from 'lucide-react'

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
      <div className="relative">
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <select
          className="input appearance-none !pr-10"
          value={value}
          required={required}
          onChange={(event) => onChange(event.target.value)}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </FormField>
  )
}
