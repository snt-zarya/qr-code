/*
 * Платёжный QR-код по ГОСТ Р 56042-2014.
 * Строка: ST00012|Key1=Value1|Key2=Value2|...
 *   ST    — служебный признак (Service Tag)
 *   0001  — версия формата
 *   2     — кодировка: 1=Windows-1251, 2=UTF-8, 3=KOI8-R (используем UTF-8)
 *   |     — разделитель полей
 * Обязательные: Name, PersonalAcc, BankName, BIC, CorrespAcc.
 */

export const onlyDigits = (v, len) => new RegExp(`^\\d{${len}}$`).test(v)

// Контрольный ключ счёта по БИК (алгоритм ЦБ РФ): к счёту приписываем
// 3 цифры (для р/с — последние 3 цифры БИК; для корр/с — 0 + поз. 5-6 БИК),
// получаем 23 цифры, считаем взвешенную сумму, остаток от деления на 10 = 0.
export function checkAccount(acc, prefix) {
  if (!onlyDigits(acc, 20) || !/^\d{3}$/.test(prefix)) return false
  const base = prefix + acc
  const w = [7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1]
  let sum = 0
  for (let i = 0; i < 23; i++) sum += w[i] * (Number(base[i]) % 10)
  return sum % 10 === 0
}

export const checkPersonalAcc = (acc, bic) =>
  onlyDigits(bic, 9) ? checkAccount(acc, bic.slice(-3)) : true

export const checkCorrespAcc = (acc, bic) =>
  onlyDigits(bic, 9) ? checkAccount(acc, '0' + bic.slice(4, 6)) : true

export function checkINN(v) {
  if (!/^\d{10}$|^\d{12}$/.test(v)) return false
  const d = v.split('').map(Number)
  const ctrl = (c) => ((c.reduce((s, k, i) => s + k * d[i], 0) % 11) % 10)
  if (v.length === 10) return ctrl([2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[9]
  const n11 = ctrl([7, 2, 4, 10, 3, 5, 9, 4, 6, 8])
  const n12 = ctrl([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8])
  return n11 === d[10] && n12 === d[11]
}

// Сумма в рублях ("1234.56") -> копейки целым числом, как требует ГОСТ.
export function sumToKopecks(v) {
  if (!v) return ''
  const n = Math.round(parseFloat(String(v).replace(',', '.')) * 100)
  return Number.isFinite(n) ? String(n) : ''
}

// Разделитель '|' и '=' внутри значений недопустимы.
const sanitize = (v) => String(v).replace(/[|=]/g, ' ').replace(/\s+/g, ' ').trim()

export const REQUIRED = ['Name', 'PersonalAcc', 'BankName', 'BIC', 'CorrespAcc']

// Порядок полей в строке: обязательные, затем дополнительные.
const STANDARD_KEYS = [
  'Name', 'PersonalAcc', 'BankName', 'BIC', 'CorrespAcc',
  'Sum', 'Purpose', 'PayeeINN', 'KPP', 'PersAcc',
]
const BUDGET_KEYS = ['DrawerStatus', 'CBC', 'OKTMO', 'PaytReason', 'TaxPeriod', 'DocNo']

export function buildPayload(values, mode) {
  const keys = mode === 'budget' ? [...STANDARD_KEYS, ...BUDGET_KEYS] : STANDARD_KEYS
  const parts = []
  for (const key of keys) {
    let val = values[key]
    if (key === 'Sum') val = sumToKopecks(val)
    if (val) parts.push(`${key}=${sanitize(val)}`)
  }
  return 'ST00012|' + parts.join('|')
}

// Возвращает { field: { error?, warn?, ok? } } по текущим значениям и режиму.
export function validate(values, mode) {
  const v = (k) => (values[k] || '').trim()
  const out = {}
  const set = (k, state) => { out[k] = state }

  REQUIRED.forEach((k) => { if (!v(k)) set(k, { error: 'Обязательное поле' }) })

  if (v('PersonalAcc')) {
    if (!onlyDigits(v('PersonalAcc'), 20)) set('PersonalAcc', { error: 'Нужно 20 цифр' })
    else if (v('BIC') && onlyDigits(v('BIC'), 9) && !checkPersonalAcc(v('PersonalAcc'), v('BIC')))
      set('PersonalAcc', { error: 'Счёт не сходится с БИК (контрольный ключ)' })
    else set('PersonalAcc', { ok: 'Контрольный ключ совпал' })
  }

  if (v('BIC') && !onlyDigits(v('BIC'), 9)) set('BIC', { error: 'Нужно 9 цифр' })

  if (v('CorrespAcc')) {
    if (!onlyDigits(v('CorrespAcc'), 20)) set('CorrespAcc', { error: 'Нужно 20 цифр' })
    else if (v('BIC') && onlyDigits(v('BIC'), 9) && !checkCorrespAcc(v('CorrespAcc'), v('BIC')))
      set('CorrespAcc', { warn: 'Корр. счёт не сходится с БИК' })
  }

  if (v('PayeeINN') && !checkINN(v('PayeeINN'))) set('PayeeINN', { error: 'Неверный ИНН' })

  if (v('Sum') && !/^\d+([.,]\d{1,2})?$/.test(v('Sum')))
    set('Sum', { error: 'Сумма в рублях, напр. 1234.56' })

  const digitsRule = (k, len, label) => {
    if (v(k) && !onlyDigits(v(k), len)) set(k, { error: `Нужно ${len} цифр` })
  }
  digitsRule('KPP', 9)
  digitsRule('CBC', 20)
  if (v('OKTMO') && !/^\d{8}$|^\d{11}$/.test(v('OKTMO'))) set('OKTMO', { error: '8 или 11 цифр' })

  if (mode === 'budget') {
    ;['KPP', 'CBC', 'OKTMO'].forEach((k) => { if (!v(k)) set(k, { error: 'Для бюджета обязателен' }) })
  }

  return out
}

// Можно ли формировать QR: все обязательные заполнены и нет жёстких ошибок.
export function isReady(values, errors, mode) {
  const required = REQUIRED.every((k) => (values[k] || '').trim())
  if (!required) return false
  if (mode === 'budget' && !['KPP', 'CBC', 'OKTMO'].every((k) => (values[k] || '').trim()))
    return false
  return !Object.values(errors).some((s) => s && s.error)
}
