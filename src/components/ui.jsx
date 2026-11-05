import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { ITEM_STATUS, CONDITIONS, statusLabel, TYPE_LABEL } from '../lib/constants'

export const itemUrl = (code) => `${window.location.origin}/i/${code}`

export function QrImg({ code, size = 160 }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(itemUrl(code), { margin: 1, width: size * 2, errorCorrectionLevel: 'M' })
      .then(setSrc)
  }, [code, size])
  return src ? <img src={src} width={size} height={size} alt={`QR ${code}`} /> : null
}

export function Thumb({ url, size = 56 }) {
  return url
    ? <img className="thumb" src={url} width={size} height={size} alt="" loading="lazy" />
    : <div className="thumb thumb-empty" style={{ width: size, height: size }}>◻</div>
}

export function ItemWhere({ item }) {
  if (item.out_address) return <span className="pill pill-out">Out · {item.out_address}</span>
  if (item.status !== 'available') return <span className="pill pill-warn">{ITEM_STATUS[item.status]}</span>
  return <span className="pill pill-in">In shed{item.shed_location ? ` · ${item.shed_location}` : ''}</span>
}

export function ConditionPill({ c }) {
  if (c === 'good') return null
  return <span className={`pill ${c === 'needs_repair' ? 'pill-warn' : 'pill-muted'}`}>{CONDITIONS[c]}</span>
}

export function JobPill({ job }) {
  const cls = job.status === 'cancelled' ? 'pill-muted'
    : job.status === 'complete' ? 'pill-in' : 'pill-accent'
  return <span className={`pill ${cls}`}>{statusLabel(job.type, job.status)}</span>
}

export function TypeTag({ type }) {
  return <span className={`tag tag-${type}`}>{TYPE_LABEL[type]}</span>
}

export function Loading() {
  return <div className="loading">Loading…</div>
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
