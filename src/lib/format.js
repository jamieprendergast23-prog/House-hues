// Dates are stored as 'YYYY-MM-DD' strings; treat them as local calendar days.
export function parseDate(s) {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDays(s, n) {
  const d = parseDate(s)
  if (!d) return null
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export const today = () => toISO(new Date())

export function fmtDate(s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const d = parseDate(s)
  return d ? d.toLocaleDateString('en-AU', opts) : '—'
}

export const fmtLong = (s) =>
  fmtDate(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export function money(n) {
  if (n === null || n === undefined || n === '') return '—'
  return Number(n).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' })
}

export function hireEnd(job) {
  return job?.install_date ? addDays(job.install_date, (job.hire_weeks || 6) * 7) : null
}

export function daysUntil(s) {
  const d = parseDate(s)
  if (!d) return null
  const t = parseDate(today())
  return Math.round((d - t) / 86400000)
}

// Pull an item code out of whatever a QR contains (full URL or bare code)
export function codeFromScan(text) {
  const t = (text || '').trim()
  const m = t.match(/\/i\/([A-Za-z0-9-]+)/)
  return (m ? m[1] : t).toUpperCase()
}

// Shrink photos before upload so storage stays small and uploads are quick on 4G
export async function compressImage(file, max = 1400, quality = 0.82) {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale)
  c.height = Math.round(img.height * scale)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return new Promise((res) => c.toBlob(res, 'image/jpeg', quality))
}
