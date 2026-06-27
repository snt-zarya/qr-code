import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { reachGoal } from '../lib/metrika.js'

// UTF-8 байтовый режim qrcode выбирает автоматически для кириллицы.
const QR_OPTS = { errorCorrectionLevel: 'M', margin: 2 }

export default function QrPreview({ payload, ready, error }) {
  const [svg, setSvg] = useState('')
  const [meta, setMeta] = useState(null)
  const [genError, setGenError] = useState('')
  const canvasRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    if (!ready || !payload) { setSvg(''); setMeta(null); setGenError(''); return }

    QRCode.toString(payload, { type: 'svg', ...QR_OPTS })
      .then((s) => {
        if (cancelled) return
        setSvg(s)
        setGenError('')
        const bytes = new TextEncoder().encode(payload).length
        setMeta({ bytes })
      })
      .catch(() => { if (!cancelled) { setSvg(''); setGenError('Слишком много данных — сократите назначение платежа') } })

    return () => { cancelled = true }
  }, [payload, ready])

  const downloadPng = async () => {
    if (!payload) return
    const url = await QRCode.toDataURL(payload, { ...QR_OPTS, scale: 10, margin: 4 })
    triggerDownload('payment-qr.png', url)
    reachGoal('download_png')
  }

  const downloadSvg = async () => {
    const s = await QRCode.toString(payload, { type: 'svg', ...QR_OPTS })
    triggerDownload('payment-qr.svg', 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s))
    reachGoal('download_svg')
  }

  const status = !ready
    ? { type: 'wait', text: error || 'Заполните обязательные поля (*)' }
    : genError
    ? { type: 'err', text: genError }
    : { type: 'ok', text: `Готово · ${meta?.bytes ?? '—'} байт` }

  const statusCls = {
    wait: 'bg-panel2 text-muted',
    ok: 'bg-emerald-500/12 text-emerald-400',
    err: 'bg-red-500/12 text-red-400',
  }[status.type]

  const canDownload = ready && svg && !genError

  return (
    <div className="flex flex-col gap-3.5">
      <div className="bg-white rounded-xl p-3.5 aspect-square flex items-center justify-center">
        {svg
          ? <div className="w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
          : <span className="text-slate-300 text-5xl font-extrabold tracking-widest">QR</span>}
      </div>

      <div className={`text-[13px] text-center py-2 rounded-lg font-semibold ${statusCls}`}>
        {status.text}
      </div>

      <div className="flex gap-2">
        <button onClick={downloadPng} disabled={!canDownload}
          className="flex-1 bg-brand hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition">
          Скачать PNG
        </button>
        <button onClick={downloadSvg} disabled={!canDownload}
          className="flex-1 bg-panel2 border border-line hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold py-2.5 rounded-lg transition">
          Скачать SVG
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

function triggerDownload(name, href) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}
