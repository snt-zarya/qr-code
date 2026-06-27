/*
 * Справочник банков (БИК → наименование + корр. счёт).
 * Источник: официальный справочник БИК ЦБ РФ (формат ED807).
 * Файл public/banks.json загружается один раз по запросу и кешируется.
 */

let cache = null
let promise = null

export function loadBanks() {
  if (cache) return Promise.resolve(cache)
  if (promise) return promise
  promise = fetch(`${import.meta.env.BASE_URL}banks.json`)
    .then((r) => {
      if (!r.ok) throw new Error('banks.json: ' + r.status)
      return r.json()
    })
    .then((data) => {
      cache = data
      return data
    })
    .catch((e) => {
      promise = null // дать повторить попытку позже
      throw e
    })
  return promise
}

// Поиск банка по БИК. Возвращает { name, corr } или null.
export async function lookupBank(bic) {
  if (!/^\d{9}$/.test(bic)) return null
  const banks = await loadBanks()
  const rec = banks[bic]
  return rec ? { name: rec.n, corr: rec.c, city: rec.t } : null
}
