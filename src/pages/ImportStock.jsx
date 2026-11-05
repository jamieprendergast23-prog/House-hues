import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, friendlyError } from '../lib/supabase'
import { parseCSV } from '../lib/csv'
import { CATEGORIES, CONDITIONS } from '../lib/constants'
import { toast } from '../lib/toast'

// Fields we can fill, and header words that usually mean them
const FIELDS = [
  ['name', 'Item name *', ['name', 'item', 'description', 'product', 'piece']],
  ['category', 'Category', ['category', 'type', 'cat', 'group']],
  ['colour', 'Colour', ['colour', 'color', 'finish']],
  ['dimensions', 'Size', ['size', 'dimension', 'measure']],
  ['shed_location', 'Shed spot', ['location', 'shed', 'bay', 'spot', 'where', 'shelf']],
  ['qty', 'Quantity', ['qty', 'quantity', 'count', 'how many', 'number', 'units']],
  ['condition', 'Condition', ['condition', 'state']],
  ['purchase_cost', 'Cost paid ($)', ['cost', 'paid', 'price', 'purchase']],
  ['replacement_value', 'Replacement ($)', ['replacement', 'value', 'rrp', 'worth']],
  ['notes', 'Notes', ['note', 'comment']],
]

function guess(headers) {
  const map = {}
  const used = new Set()
  for (const [key, , words] of FIELDS) {
    const idx = headers.findIndex((h, i) => !used.has(i) && words.some((w) => h.toLowerCase().includes(w)))
    if (idx >= 0) { map[key] = idx; used.add(idx) }
  }
  return map
}

function matchCategory(raw) {
  const s = (raw || '').trim().toLowerCase()
  if (!s) return 'Other'
  return CATEGORIES.find((c) => c.toLowerCase() === s)
    || CATEGORIES.find((c) => s.startsWith(c.toLowerCase()) || c.toLowerCase().startsWith(s.replace(/s$/, '')))
    || raw.trim()
}

function matchCondition(raw) {
  const s = (raw || '').toLowerCase()
  if (/repair|broken|damag|fix/.test(s)) return 'needs_repair'
  if (/fair|ok|worn|used/.test(s)) return 'fair'
  return 'good'
}

const num = (v) => { const n = parseFloat(String(v || '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null }

export default function ImportStock() {
  const nav = useNavigate()
  const [rows, setRows] = useState(null)
  const [hasHeader, setHasHeader] = useState(true)
  const [map, setMap] = useState({})
  const [busy, setBusy] = useState(false)
  const [paste, setPaste] = useState('')

  const load = (text) => {
    const r = parseCSV(text)
    if (!r.length) return toast('Couldn’t find any rows in that', 'error')
    setRows(r); setMap(guess(r[0])); setHasHeader(true)
  }

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (/\.xlsx?$/i.test(f.name)) return toast('Save it as CSV first (File → Save As → CSV), or copy the cells and paste below', 'error')
    load(await f.text())
  }

  const headers = rows ? (hasHeader ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`)) : []
  const body = rows ? (hasHeader ? rows.slice(1) : rows) : []

  const parsed = useMemo(() => body.map((r) => {
    const get = (k) => (map[k] !== undefined ? (r[map[k]] || '').trim() : '')
    return {
      name: get('name'), category: matchCategory(get('category')), colour: get('colour') || null,
      dimensions: get('dimensions') || null, shed_location: get('shed_location') || null,
      condition: matchCondition(get('condition')), notes: get('notes') || null,
      qty: Math.max(1, Math.min(100, parseInt(get('qty'), 10) || 1)),
      purchase_cost: num(get('purchase_cost')), replacement_value: num(get('replacement_value')),
    }
  }).filter((r) => r.name), [body, map])

  const pieces = parsed.reduce((n, r) => n + r.qty, 0)

  const run = async () => {
    setBusy(true)
    try {
      const all = parsed.flatMap((r) => Array.from({ length: r.qty }, () => r))
      for (let i = 0; i < all.length; i += 200) {
        const chunk = all.slice(i, i + 200)
        const { data, error } = await supabase.from('items').insert(chunk.map((r) => ({
          name: r.name, category: r.category, colour: r.colour, dimensions: r.dimensions,
          shed_location: r.shed_location, condition: r.condition, notes: r.notes,
          status: r.condition === 'needs_repair' ? 'repair' : 'available',
        }))).select('id')
        if (error) throw error
        const costs = data.map((d, k) => ({ item_id: d.id, purchase_cost: chunk[k].purchase_cost, replacement_value: chunk[k].replacement_value }))
          .filter((c) => c.purchase_cost !== null || c.replacement_value !== null)
        if (costs.length) await supabase.from('item_costs').insert(costs)
      }
      toast(`${all.length} pieces added`)
      nav('/inventory')
    } catch (e) { toast(friendlyError(e), 'error') }
    setBusy(false)
  }

  if (!rows) {
    return (
      <div className="stack">
        <h1>Import stock</h1>
        <p className="muted">Bring in your current spreadsheet. Every piece gets its own code and QR label. If a row says quantity 6, you get 6 pieces.</p>
        <section className="card">
          <h2>Option 1: paste from Excel or Google Sheets</h2>
          <p className="small muted">Select the cells including the heading row, copy, then paste here.</p>
          <textarea rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Item\tCategory\tColour\tQty\tLocation\nLinen sofa\tSofa\tOatmeal\t1\tBay 1'} />
          <button className="btn btn-primary" disabled={!paste.trim()} onClick={() => load(paste)}>Next</button>
        </section>
        <section className="card">
          <h2>Option 2: upload a CSV file</h2>
          <label className="btn">Choose file<input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" hidden onChange={onFile} /></label>
        </section>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Match your columns</h1>
        <button className="btn btn-ghost" onClick={() => setRows(null)}>Start again</button>
      </div>
      <label className="row small"><input type="checkbox" className="big-check" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> First row is headings</label>

      <section className="card">
        <div className="grid2">
          {FIELDS.map(([key, label]) => (
            <label key={key} className="field"><span className="field-label">{label}</span>
              <select value={map[key] ?? ''} onChange={(e) => setMap({ ...map, [key]: e.target.value === '' ? undefined : Number(e.target.value) })}>
                <option value="">— not in my sheet —</option>
                {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Preview <span className="muted small">{parsed.length} rows → {pieces} pieces</span></h2>
        {map.name === undefined ? <p className="warn-text">Pick which column has the item name.</p> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Category</th><th>Colour</th><th>Qty</th><th>Shed</th><th>Condition</th></tr></thead>
              <tbody>
                {parsed.slice(0, 12).map((r, i) => (
                  <tr key={i}><td>{r.name}</td><td>{r.category}</td><td>{r.colour}</td><td>{r.qty}</td><td>{r.shed_location}</td><td>{CONDITIONS[r.condition]}</td></tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 12 && <p className="small muted">…and {parsed.length - 12} more rows</p>}
          </div>
        )}
      </section>

      <div className="sticky-actions row">
        <button className="btn btn-primary btn-big grow" disabled={!pieces || busy} onClick={run}>
          {busy ? 'Importing…' : `Add ${pieces} pieces to stock`}
        </button>
      </div>
    </div>
  )
}
