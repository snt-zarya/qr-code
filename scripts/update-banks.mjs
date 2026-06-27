// Обновление справочника банков public/banks.json из официального файла ЦБ РФ.
//
// Запуск:  npm run update-banks
//
// Скрипт сам находит последний доступный файл ED807 на сайте Банка России
// (https://www.cbr.ru/.../BIKNew/<ДАТА>ED01OSBR.zip), распаковывает,
// разбирает XML (WINDOWS-1251) и пересобирает компактный JSON:
//   { "044525225": { "n": "ПАО СБЕРБАНК", "c": "30101810400000000225", "t": "Москва" }, ... }
// где n — наименование, c — корр. счёт (CRSA), t — город.

import { unzipSync } from 'fflate'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'banks.json')
const BASE = 'https://www.cbr.ru/vfs/mcirabis/BIKNew/'

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`

// Перебираем последние 10 дней — берём первый доступный файл (свежий business day).
async function fetchLatestZip() {
  const today = new Date()
  for (let i = 0; i < 10; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const url = `${BASE}${ymd(d)}ED01OSBR.zip`
    const res = await fetch(url)
    if (res.ok) {
      console.log('Скачан:', url)
      return new Uint8Array(await res.arrayBuffer())
    }
  }
  throw new Error('Не удалось найти файл ED807 за последние 10 дней')
}

const unescapeXml = (s) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

function parse(xml) {
  const banks = {}
  let total = 0
  const entryRe = /<BICDirectoryEntry BIC="(\d{9})">([\s\S]*?)<\/BICDirectoryEntry>/g
  for (const [, bic, body] of xml.matchAll(entryRe)) {
    total++
    const name = body.match(/<ParticipantInfo[^>]*\bNameP="([^"]*)"/)?.[1]
    if (!name) continue
    const city = body.match(/<ParticipantInfo[^>]*\bNnp="([^"]*)"/)?.[1] || ''
    // корр. счёт: активный (ACAC) Account типа CRSA
    const corr = body.match(
      /<Accounts [^>]*Account="(\d{20})"[^>]*RegulationAccountType="CRSA"[^>]*AccountStatus="ACAC"/
    )?.[1]
    if (!corr) continue // нет собственного корр. счёта — пропускаем
    const rec = { n: unescapeXml(name), c: corr }
    if (city) rec.t = unescapeXml(city)
    banks[bic] = rec
  }
  return { banks, total }
}

const zip = await fetchLatestZip()
const files = unzipSync(zip)
const xmlName = Object.keys(files).find((n) => n.toLowerCase().endsWith('.xml'))
if (!xmlName) throw new Error('В архиве не найден XML')

const xml = new TextDecoder('windows-1251').decode(files[xmlName])
const { banks, total } = parse(xml)

const json = JSON.stringify(banks)
writeFileSync(OUT, json)
console.log(`Записей в файле: ${total}, с корр. счётом: ${Object.keys(banks).length}`)
console.log(`Сохранено: ${OUT} (${Buffer.byteLength(json, 'utf8')} байт)`)
console.log('Пример 044525225:', banks['044525225'])
