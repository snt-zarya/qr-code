export default function Field({
  label, name, value, onChange, state, required, budgetReq,
  placeholder, hint, textarea, maxLength, inputMode, full,
}) {
  const error = state?.error
  const warn = state?.warn
  const okMsg = state?.ok

  const ring = error
    ? 'border-red-500 focus:ring-red-500/30'
    : warn
    ? 'border-amber-500 focus:ring-amber-500/30'
    : okMsg && value
    ? 'border-emerald-500/60 focus:ring-brand/30'
    : 'border-line focus:border-brand focus:ring-brand/25'

  const message = error || warn || (value ? okMsg : '') || hint
  const msgColor = error ? 'text-red-400' : warn ? 'text-amber-400'
    : okMsg && value ? 'text-emerald-400' : 'text-muted'

  const cls =
    `w-full bg-panel2 border ${ring} text-[#e6eaf0] rounded-lg px-3 py-2.5 ` +
    `outline-none transition focus:ring-3 placeholder:text-muted/60`

  return (
    <label className={`flex flex-col gap-1.5 min-w-0 ${full ? 'sm:col-span-2' : ''}`}>
      <span className="text-[13px] text-[#c2cad6]">
        {label}{' '}
        {required && <i className="text-brand not-italic">*</i>}
        {budgetReq && <i className="text-amber-400 not-italic">*</i>}
      </span>
      {textarea ? (
        <textarea
          name={name} value={value} onChange={onChange} rows={2}
          maxLength={maxLength} placeholder={placeholder}
          className={cls + ' resize-y'}
        />
      ) : (
        <input
          name={name} value={value} onChange={onChange}
          maxLength={maxLength} placeholder={placeholder} inputMode={inputMode}
          className={cls}
        />
      )}
      <small className={`text-[11.5px] min-h-[14px] ${msgColor}`}>{message}</small>
    </label>
  )
}
