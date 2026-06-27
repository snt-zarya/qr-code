import { useEffect, useMemo, useRef, useState } from 'react'
import Field from './components/Field.jsx'
import QrPreview from './components/QrPreview.jsx'
import { buildPayload, validate, isReady } from './lib/payment.js'
import { lookupBank } from './lib/banks.js'
import { reachGoal } from './lib/metrika.js'

const EMPTY = {
  Name: '', PayeeINN: '', KPP: '', PersonalAcc: '', BankName: '', BIC: '',
  CorrespAcc: '', Sum: '', PersAcc: '', Purpose: '',
  DrawerStatus: '', CBC: '', OKTMO: '', PaytReason: '', TaxPeriod: '', DocNo: '',
}

const STORAGE_KEY = 'qr-payment-ru:v1'

// Читаем сохранённое состояние при старте; берём только известные ключи.
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    const values = { ...EMPTY }
    for (const k of Object.keys(EMPTY)) {
      if (typeof data.values?.[k] === 'string') values[k] = data.values[k]
    }
    const mode = data.mode === 'budget' ? 'budget' : 'standard'
    return { values, mode }
  } catch {
    return null
  }
}

const EXAMPLE = {
  ...EMPTY,
  Name: 'ООО «Ромашка»',
  PayeeINN: '7707083893',
  KPP: '773601001',
  PersonalAcc: '40702810938000000001',
  BankName: 'ПАО СБЕРБАНК',
  BIC: '044525225',
  CorrespAcc: '30101810400000000225',
  Sum: '1500.00',
  Purpose: 'Оплата по счёту № 12 от 27.06.2026. Без НДС.',
}

const SAVED = loadState()

export default function App() {
  const [values, setValues] = useState(SAVED?.values ?? EMPTY)
  const [mode, setMode] = useState(SAVED?.mode ?? 'standard') // 'standard' | 'budget'
  const [copied, setCopied] = useState(false)
  const [bank, setBank] = useState(null) // результат поиска по БИК: {found, name} | null

  // Автосохранение формы и режима в localStorage.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ values, mode }))
    } catch { /* localStorage недоступен (приватный режим) — молча пропускаем */ }
  }, [values, mode])

  // Автоподстановка банка и корр. счёта по БИК из справочника ЦБ РФ.
  useEffect(() => {
    const bic = (values.BIC || '').trim()
    if (!/^\d{9}$/.test(bic)) { setBank(null); return }
    let cancelled = false
    lookupBank(bic)
      .then((rec) => {
        if (cancelled) return
        if (!rec) { setBank({ found: false }); return }
        setBank({ found: true, name: rec.name })
        setValues((v) =>
          v.BankName === rec.name && v.CorrespAcc === rec.corr
            ? v
            : { ...v, BankName: rec.name, CorrespAcc: rec.corr })
      })
      .catch(() => { if (!cancelled) setBank(null) })
    return () => { cancelled = true }
  }, [values.BIC])

  const errors = useMemo(() => validate(values, mode), [values, mode])
  const ready = useMemo(() => isReady(values, errors, mode), [values, errors, mode])
  const payload = useMemo(() => (ready ? buildPayload(values, mode) : ''), [values, mode, ready])

  // Цель «QR сформирован» — один раз при переходе формы в готовое состояние.
  const wasReady = useRef(false)
  useEffect(() => {
    if (ready && !wasReady.current) reachGoal('qr_ready')
    wasReady.current = ready
  }, [ready])

  const firstError = Object.values(errors).find((s) => s?.error)?.error

  const set = (e) => {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
  }

  const f = (name, extra = {}) => ({
    name, value: values[name], onChange: set, state: errors[name], ...extra,
  })

  const copyPayload = async () => {
    if (!payload) return
    try { await navigator.clipboard.writeText(payload) } catch { /* noop */ }
    reachGoal('copy_string')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="max-w-[1080px] mx-auto px-4 py-8 pb-16">
      <header className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight mb-1.5">Платёжный QR-код</h1>
        <p className="text-muted max-w-[760px] leading-relaxed">
          Сформируйте QR по стандарту <b className="text-[#e6eaf0]">ГОСТ&nbsp;Р&nbsp;56042-2014</b>{' '}
          (формат <code className="bg-panel2 px-1.5 py-0.5 rounded text-slate-300">ST00012</code>).
          Приложение банка считает код и автоматически заполнит платёжное поручение.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4.5 items-start gap-4">
        {/* Форма */}
        <div className="bg-panel border border-line rounded-2xl p-5">
          <div className="flex gap-1.5 bg-panel2 p-1.5 rounded-xl mb-5">
            {[['standard', 'Обычный платёж'], ['budget', 'Бюджетный (налоги, ЖКХ)']].map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${
                  mode === m ? 'bg-brand text-white' : 'text-muted hover:text-[#e6eaf0]'}`}>
                {label}
              </button>
            ))}
          </div>

          <Section title="Получатель платежа">
            <Field full label="Наименование получателя" required {...f('Name', { maxLength: 160 })}
              placeholder="ООО «Ромашка» или Иванов Иван Иванович" />
            <Field label="ИНН получателя" {...f('PayeeINN', { maxLength: 12, inputMode: 'numeric' })}
              placeholder="10 или 12 цифр" />
            <Field label="КПП" budgetReq={mode === 'budget'}
              {...f('KPP', { maxLength: 9, inputMode: 'numeric' })} placeholder="9 цифр" />
          </Section>

          <Section title="Банковские реквизиты">
            <Field full label="Расчётный счёт получателя" required
              {...f('PersonalAcc', { maxLength: 20, inputMode: 'numeric' })} placeholder="20 цифр" />
            <Field label="БИК" required {...f('BIC', { maxLength: 9, inputMode: 'numeric' })}
              placeholder="9 цифр"
              hint={bank?.found ? `✓ ${bank.name}` : bank ? 'Банк не найден в справочнике' : 'Банк и корр. счёт подставятся автоматически'} />
            <Field label="Корр. счёт" required
              {...f('CorrespAcc', { maxLength: 20, inputMode: 'numeric' })} placeholder="20 цифр" />
            <Field full label="Наименование банка" required
              {...f('BankName', { maxLength: 160 })} placeholder="ПАО Сбербанк" />
          </Section>

          <Section title="Платёж">
            <Field label="Сумма, ₽" {...f('Sum', { inputMode: 'decimal' })}
              placeholder="1234.56" hint="Необязательно. Копейки через точку." />
            <Field label="Счёт плательщика (PersAcc)" {...f('PersAcc', { maxLength: 20 })}
              placeholder="лицевой счёт / ID" />
            <Field full textarea label="Назначение платежа" {...f('Purpose', { maxLength: 210 })}
              placeholder="Оплата по счёту №… от …. Без НДС." />
          </Section>

          {mode === 'budget' && (
            <Section title="Реквизиты бюджетного платежа">
              <Field label="КБК (CBC)" budgetReq {...f('CBC', { maxLength: 20, inputMode: 'numeric' })}
                placeholder="20 цифр" />
              <Field label="ОКТМО (OKTMO)" budgetReq {...f('OKTMO', { maxLength: 11, inputMode: 'numeric' })}
                placeholder="8 или 11 цифр" />
              <Field label="Статус плательщика" {...f('DrawerStatus', { maxLength: 2, inputMode: 'numeric' })}
                placeholder="напр. 13" />
              <Field label="Основание платежа" {...f('PaytReason', { maxLength: 2 })}
                placeholder="ТП / ЗД / 0" />
              <Field label="Налоговый период" {...f('TaxPeriod', { maxLength: 10 })}
                placeholder="МС.06.2026" />
              <Field label="УИН (Index / DocNo)" {...f('DocNo', { maxLength: 25 })}
                placeholder="индекс документа / УИН" />
            </Section>
          )}

          <div className="flex gap-2 mt-2">
            <button onClick={() => setValues(EMPTY)}
              className="px-4 py-2.5 rounded-lg border border-line bg-transparent hover:border-slate-500 font-semibold transition">
              Очистить
            </button>
            <button onClick={() => setValues(EXAMPLE)}
              className="px-4 py-2.5 rounded-lg border border-line bg-transparent hover:border-slate-500 font-semibold transition">
              Пример
            </button>
          </div>
        </div>

        {/* Результат */}
        <aside className="bg-panel border border-line rounded-2xl p-5 lg:sticky lg:top-4 flex flex-col gap-3.5">
          <QrPreview payload={payload} ready={ready} error={firstError} />

          <details className="group">
            <summary className="cursor-pointer text-muted text-[13px] select-none">Строка QR (ST00012)</summary>
            <pre className="bg-panel2 border border-line rounded-lg p-2.5 text-[11.5px] whitespace-pre-wrap break-all my-2.5 max-h-40 overflow-auto text-slate-300">
              {payload || '—'}
            </pre>
            <button onClick={copyPayload} disabled={!payload}
              className="text-[13px] px-2.5 py-1.5 rounded-lg border border-line hover:border-slate-500 disabled:opacity-40 transition">
              {copied ? 'Скопировано ✓' : 'Скопировать строку'}
            </button>
          </details>

          <p className="text-[11.5px] text-muted leading-snug m-0">
            Поддерживается приложениями Сбербанк, Т-Банк, ВТБ, Альфа-Банк и др.
            Перед оплатой сверьте реквизиты — данные не передаются на сервер,
            всё считается в браузере.
          </p>
        </aside>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <fieldset className="border-0 m-0 p-0 pb-3.5 mb-3 border-b border-line last:border-b-0 last:pb-0">
      <legend className="text-[12px] uppercase tracking-wider text-muted mb-3">{title}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3.5 gap-y-3">{children}</div>
    </fieldset>
  )
}
