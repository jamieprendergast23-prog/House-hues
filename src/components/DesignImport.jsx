import { useEffect, useMemo, useState } from 'react'
import { supabase, friendlyError, fetchAll } from '../lib/supabase'
import { parseCSV } from '../lib/csv'
import { ROOMS, UNPLACED } from '../lib/constants'
import { toast } from '../lib/toast'
import { Modal, Thumb, Loading } from './ui'

// Her own item codes look like A1, F49, V12, HH-0042
const CODE_RE = /\b(HH-\d{4}|[A-Z]{1,3}-?\d{1,4}[A-Z]?)\b/i
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Turn a design's item list into pick-list lines.
 * Works with a SketchUp "Generate Report" CSV (name, quantity, tag=room),
 * or any pasted list (from Planner 5D, Canva notes, ChatGPT, a text message):
 * one item per line, with her code (F49) and/or description, optional "2x".
 */
export default function DesignImport({ jobId, rooms, defaultRoom, onClose, onDone }) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState(null)
  const [stock, setStock] = useState(null) // all items
  const [free, setFree] = useState(null) // ids free for this job's dates
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchAll(() => supabase.from('items').select('id, code, sku, name, category, photo_url, status').neq('status', 'retired').order('code')),
      fetchAll(() => supabase.rpc('available_items', { p_job_id: jobId })),
    ]).then(([s, f]) => { setStock(s); setFree(new Set(f.map((x) => x.id))) })
      .catch((e) => toast(friendlyError(e), 'error'))
  }, [jobId])

  const allRooms = useMemo(() => [...new Set([...rooms, ...ROOMS])], [rooms])
  const matchRoom = (s) => {
    const n = norm(s)
    if (!n) return null
    return allRooms.find((r) => norm(r) === n) || allRooms.find((r) => n.includes(norm(r)) || norm(r).includes(n)) || s.trim()
  }

  const parse = (src) => {
    const lines = []
    const table = parseCSV(src)
    const head = (table[0] || []).map((h) => norm(h))
    const isTable = table.length > 1 && head.some((h) => /name|description|item|component|definition/.test(h))
    if (isTable) {
      const col = (re) => head.findIndex((h) => re.test(h))
      const cName = col(/definition name|component|description|item|name/)
      const cQty = col(/quantity|qty|count/)
      const cRoom = col(/room|tag|layer/)
      for (const r of table.slice(1)) {
        const name = (r[cName] || '').trim()
        if (!name) continue
        lines.push({ raw: name, qty: parseInt(r[cQty], 10) || 1, room: cRoom >= 0 ? matchRoom(r[cRoom]) : null })
      }
    } else {
      let room = null
      for (const lineRaw of src.split(/\r?\n/)) {
        const line = lineRaw.replace(/^[\s\-•*·\d.)]+(?=[A-Za-z])/, (m) => (/\d/.test(m) && /x/i.test(lineRaw.slice(m.length, m.length + 2)) ? m : '')).trim()
        if (!line) continue
        // a line that is just a room name sets the room for the lines under it
        const asRoom = allRooms.find((r) => norm(r) === norm(line.replace(/[:\-–]+$/, '')))
        if (asRoom) { room = asRoom; continue }
        const q = line.match(/^(\d+)\s*[x×]\s*/i) || line.match(/\s*[x×]\s*(\d+)$/i) || line.match(/\(\s*(\d+)\s*\)$/)
        lines.push({ raw: q ? line.replace(q[0], '').trim() : line, qty: q ? parseInt(q[1], 10) : 1, room })
      }
    }
    return lines
  }

  const preview = () => {
    const parsed = parse(text)
    if (!parsed.length) return toast('Couldn’t find any items in that', 'error')
    const taken = new Set()
    const bySku = new Map()
    for (const s of stock) {
      for (const k of [s.sku, s.code].filter(Boolean)) {
        const key = k.toLowerCase()
        if (!bySku.has(key)) bySku.set(key, [])
        bySku.get(key).push(s)
      }
    }
    setRows(parsed.map((p, i) => {
      const code = p.raw.match(CODE_RE)?.[1]
      let candidates = code ? bySku.get(code.toLowerCase()) || [] : []
      let how = candidates.length ? 'code' : null
      if (!candidates.length) {
        // fall back to description: every word of the line's description appears in the item's
        const words = norm(p.raw.replace(CODE_RE, '')).split(' ').filter((w) => w.length > 2)
        if (words.length) {
          const scored = stock.map((s) => ({ s, n: words.filter((w) => norm(s.name).includes(w)).length }))
            .filter((x) => x.n >= Math.max(2, Math.ceil(words.length * 0.6)))
            .sort((a, b) => b.n - a.n)
          if (scored.length) {
            const best = scored[0].s
            candidates = stock.filter((s) => s.name === best.name && s.sku === best.sku)
            how = 'description'
          }
        }
      }
      const freeOnes = candidates.filter((c) => free.has(c.id) && !taken.has(c.id))
      const pick = freeOnes.slice(0, p.qty)
      pick.forEach((c) => taken.add(c.id))
      return {
        i, raw: p.raw, qty: p.qty, room: p.room || defaultRoom || UNPLACED,
        item: candidates[0] || null, pick, how, include: pick.length > 0,
        short: candidates.length ? p.qty - pick.length : 0,
      }
    }))
  }

  const add = async () => {
    const lines = rows.filter((r) => r.include).flatMap((r) => r.pick.map((c) => ({ job_id: jobId, item_id: c.id, room: r.room })))
    if (!lines.length) return
    setBusy(true)
    const { error } = await supabase.from('job_items').insert(lines)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast(`${lines.length} pieces added to the pick list`)
    onDone()
  }

  if (!stock || !free) return <Modal title="Import design list" onClose={onClose}><Loading /></Modal>

  const matched = rows?.filter((r) => r.item) || []
  const unmatched = rows?.filter((r) => !r.item) || []
  const totalPieces = rows?.filter((r) => r.include).reduce((n, r) => n + r.pick.length, 0) || 0

  return (
    <Modal title="Import design list" onClose={onClose}>
      {!rows ? (
        <div className="stack">
          <p className="small">Paste the item list from the design, one item per line. Include your code (F49, V12) where you can; descriptions work too. A line with just a room name (“Master bed”) puts the items under it in that room. <b>SketchUp:</b> File → Generate Report, tag components by room, then paste or upload the CSV.</p>
          <textarea rows={9} value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'Living\nF102 Cream curved sofa\nF13 travertine coffee table\n2x F143 mushroom swivel chair\n\nMaster bed\nF1 Queen bed base\nF119 x2'} />
          <div className="row">
            <label className="btn">Upload CSV / text
              <input type="file" accept=".csv,.txt,.tsv" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setText(await f.text()) }} />
            </label>
            <button className="btn btn-primary grow" disabled={!text.trim()} onClick={preview}>Match to stock</button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <p className="small">{matched.length} of {rows.length} lines matched · <b>{totalPieces}</b> piece{totalPieces === 1 ? "" : "s"} ready to add. Only pieces free for this job’s dates are used.</p>
          <ul className="list">
            {matched.map((r) => (
              <li key={r.i} className="list-row di-row">
                <input type="checkbox" className="big-check" checked={r.include} disabled={!r.pick.length}
                  onChange={(e) => setRows(rows.map((x) => (x.i === r.i ? { ...x, include: e.target.checked } : x)))} />
                <Thumb url={r.item.photo_url} size={48} />
                <div className="grow">
                  <div className="row-title">{r.item.sku ? `${r.item.sku} · ` : ''}{r.item.name}</div>
                  <div className="row-sub">
                    “{r.raw}” · {r.pick.length}/{r.qty} {r.how === 'description' ? '· matched by description, check it' : ''}
                    {r.short > 0 && <span className="warn-text"> · {r.short} not free on these dates</span>}
                  </div>
                </div>
                <select value={r.room} onChange={(e) => setRows(rows.map((x) => (x.i === r.i ? { ...x, room: e.target.value } : x)))} style={{ width: 'auto', minHeight: 38 }}>
                  {[...new Set([r.room, ...allRooms, UNPLACED])].map((x) => <option key={x} value={x}>{x === UNPLACED ? "Choose later" : x}</option>)}
                </select>
              </li>
            ))}
          </ul>
          {unmatched.length > 0 && (
            <div className="card-soft small">
              <b>Not found in stock ({unmatched.length}):</b> {unmatched.map((r) => r.raw).join(' · ')}
              <div className="muted">Add the code (e.g. F49) to those lines and match again, or add them by hand.</div>
            </div>
          )}
          <div className="row sticky-actions">
            <button className="btn btn-ghost" onClick={() => setRows(null)}>Back</button>
            <button className="btn btn-primary grow" disabled={busy || !totalPieces} onClick={add}>{busy ? 'Adding…' : `Add ${totalPieces} piece${totalPieces === 1 ? "" : "s"}`}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
