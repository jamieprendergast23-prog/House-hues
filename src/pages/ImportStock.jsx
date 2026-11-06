import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, friendlyError, fetchAll } from '../lib/supabase'
import { parseCSV } from '../lib/csv'
import { CATEGORIES } from '../lib/constants'
import { toast } from '../lib/toast'
import { compressImage } from '../lib/format'
import { openWorkbook, readSheet, imageBlob, canShow } from '../lib/xlsx'

// Fields we can fill, header words that usually mean them (best first), and words that rule a header out
const FIELDS = [
  ['name', 'Description *', ['description', 'desc', 'item name', 'product', 'name', 'item'], ['code', 'no', '#']],
  ['sku', 'Your item code', ['item code', 'code', 'sku', 'ref', 'item no', 'item #', 'stock no', 'no.', '#', 'id'], ['qty', 'description']],
  ['category', 'Category', ['category', 'type', 'group', 'cat'], []],
  ['colour', 'Colour', ['colour', 'color', 'finish'], []],
  ['dimensions', 'Size', ['size', 'dimension', 'measure'], []],
  ['shed_location', 'Shed spot', ['shed', 'bay', 'shelf', 'location', 'spot', 'where'], []],
  ['qty', 'Quantity', ['qty', 'quantity', 'on hand', 'how many', 'count', 'units'], []],
  ['condition', 'Condition', ['condition', 'state'], []],
  ['supplier', 'Shop / supplier', ['shop', 'supplier', 'store', 'bought from', 'brand'], []],
  ['purchase_cost', 'Price paid each ($)', ['price (ea', 'each', 'unit', 'price', 'cost', 'paid'], ['total']],
  ['replacement_value', 'Value each ($)', ['est value', 'replacement', 'value', 'rrp', 'worth'], ['total']],
  ['notes', 'Notes', ['note', 'comment'], []],
]

function guess(headers) {
  const map = {}
  const used = new Set()
  const hs = headers.map((h) => (h || '').toLowerCase().trim())
  for (const [key, , words, not] of FIELDS) {
    let found = -1
    for (const w of words) {
      found = hs.findIndex((h, i) => !used.has(i) && h && h.includes(w) && !not.some((x) => h.includes(x) && !w.includes(x)))
      if (found >= 0) break
    }
    if (found >= 0) { map[key] = found; used.add(found) }
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
  const [reading, setReading] = useState('')
  const [sheets, setSheets] = useState(null)
  const [progress, setProgress] = useState(null)
  const book = useRef(null)
  const [existing, setExisting] = useState(null) // pieces already in stock, for update matching
  const [updateMode, setUpdateMode] = useState(true)

  useEffect(() => {
    if (!rows || existing) return
    fetchAll(() => supabase.from('items').select('id, name, sku, category, photo_url').order('id'))
      .then(setExisting).catch(() => setExisting([]))
  }, [rows, existing])

  const applyRows = (r) => {
    // skip leading empty / title rows: headings are the first row with 2+ filled cells
    const start = Math.max(0, r.findIndex((x) => x.cells.filter((c) => c.trim()).length >= 2))
    const rr = r.slice(start)
    if (!rr.length) return toast('Couldn’t find any rows in that', 'error')
    const m = guess(rr[0].cells)
    // a code column often has no heading: look for a column that's mostly short codes like A1, F23
    if (m.sku === undefined) {
      const used = new Set(Object.values(m))
      const sample = rr.slice(1, 200)
      let best = -1, bestN = 0
      rr[0].cells.forEach((_, ci) => {
        if (used.has(ci)) return
        const n = sample.filter((r) => /^[A-Za-z]{1,3}-?\d{1,4}[A-Za-z]?$/.test((r.cells[ci] || '').trim())).length
        if (n > bestN) { best = ci; bestN = n }
      })
      if (best >= 0 && bestN >= sample.length * 0.5) m.sku = best
    }
    setRows(rr); setMap(m); setHasHeader(true)
  }

  const load = (text) => { book.current = null; applyRows(parseCSV(text).map((cells) => ({ cells, images: [] }))) }

  const loadSheet = async (s) => {
    setReading(`Reading “${s.name}”…`)
    try { applyRows(await readSheet(book.current, s)) } catch (e) { toast(e.message, 'error') }
    setReading('')
  }

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (/\.xls$/i.test(f.name)) return toast('That’s an old .xls file. Open it in Excel and Save As .xlsx first.', 'error')
    if (!/\.xlsx$/i.test(f.name)) return load(await f.text())
    setReading(`Opening ${f.name} (${Math.round(f.size / 1048576)} MB)… big files with lots of photos can take a minute.`)
    try {
      book.current = await openWorkbook(f)
      const list = book.current.sheets
      if (list.length === 1) await loadSheet(list[0])
      else { setSheets(list); setReading('') }
    } catch (err) { toast(err.message || 'Couldn’t read that file', 'error'); setReading('') }
  }

  const headers = rows ? (hasHeader ? rows[0].cells : rows[0].cells.map((_, i) => `Column ${i + 1}`)) : []
  const body = rows ? (hasHeader ? rows.slice(1) : rows) : []

  const parsed = useMemo(() => body.map((row) => {
    const r = row.cells
    const get = (k) => (map[k] !== undefined ? (r[map[k]] || '').trim() : '')
    return {
      img: row.images.find(canShow) || null,
      name: get('name') || get('sku'), sku: get('sku') || null, supplier: get('supplier') || null, category: matchCategory(get('category')), colour: get('colour') || null,
      dimensions: get('dimensions') || null, shed_location: get('shed_location') || null,
      condition: matchCondition(get('condition')), notes: get('notes') || null,
      qty: Math.max(1, Math.min(100, parseInt(get('qty'), 10) || 1)),
      purchase_cost: num(get('purchase_cost')), replacement_value: num(get('replacement_value')),
    }
  }).filter((r) => r.name), [body, map])

  const pieces = parsed.reduce((n, r) => n + r.qty, 0)
  const withPhoto = parsed.filter((r) => r.img).length
  const orphanPhotos = body.filter((r) => r.images.length && ![map.name, map.sku].some((i) => i !== undefined && (r.cells[i] || '').trim())).length

  // Re-importing the same sheet: match rows to pieces already in stock by her code
  const plan = useMemo(() => {
    const byCode = new Map()
    for (const e of existing || []) {
      for (const k of new Set([e.sku, e.name].filter(Boolean).map((x) => x.trim().toLowerCase()))) {
        if (!byCode.has(k)) byCode.set(k, [])
        byCode.get(k).push(e)
      }
    }
    const taken = new Set()
    return parsed.map((r) => {
      const hits = updateMode && r.sku ? (byCode.get(r.sku.toLowerCase()) || []).filter((e) => !taken.has(e.id)).slice(0, r.qty) : []
      hits.forEach((e) => taken.add(e.id))
      return { r, hits, add: r.qty - hits.length }
    })
  }, [parsed, existing, updateMode])
  const toUpdate = plan.reduce((n, p) => n + p.hits.length, 0)
  const toAdd = plan.reduce((n, p) => n + p.add, 0)

  // upload each row's photo once (shrunk), 4 at a time
  const uploadPhotos = async (rowsNeeding) => {
    const todo = rowsNeeding.filter((r) => r.img)
    const total = todo.length
    const urls = new Map()
    let done = 0
    setProgress({ label: 'Uploading photos', done, total })
    const worker = async () => {
      while (todo.length) {
        const r = todo.shift()
        try {
          const blob = await imageBlob(book.current, r.img)
          if (blob) {
            const small = await compressImage(blob)
            const path = `${crypto.randomUUID()}.jpg`
            const { error } = await supabase.storage.from('item-photos').upload(path, small, { contentType: 'image/jpeg' })
            if (!error) urls.set(r, supabase.storage.from('item-photos').getPublicUrl(path).data.publicUrl)
          }
        } catch { /* skip a bad image, keep going */ }
        done++
        setProgress({ label: 'Uploading photos', done, total })
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
    return urls
  }

  const run = async () => {
    setBusy(true)
    try {
      // photos only where needed: new pieces, or matched pieces that have none yet
      const needPhoto = plan.filter((p) => p.add > 0 || p.hits.some((h) => !h.photo_url)).map((p) => p.r)
      const photos = book.current && withPhoto ? await uploadPhotos(needPhoto) : new Map()

      // 1. update matched pieces (keeps their photos, QR codes and job history)
      const upd = plan.filter((p) => p.hits.length)
      let done = 0
      setProgress({ label: 'Updating pieces', done, total: upd.length })
      const updWorker = async () => {
        while (upd.length) {
          const { r, hits } = upd.shift()
          const fields = {
            name: r.name, sku: r.sku, category: r.category,
            ...(r.colour ? { colour: r.colour } : {}), ...(r.dimensions ? { dimensions: r.dimensions } : {}),
            ...(r.shed_location ? { shed_location: r.shed_location } : {}), ...(r.notes ? { notes: r.notes } : {}),
          }
          const { error } = await supabase.from('items').update(fields).in('id', hits.map((h) => h.id))
          if (error) throw error
          const noPhoto = hits.filter((h) => !h.photo_url).map((h) => h.id)
          if (noPhoto.length && photos.get(r)) await supabase.from('items').update({ photo_url: photos.get(r) }).in('id', noPhoto)
          if (r.purchase_cost !== null || r.replacement_value !== null || r.supplier) {
            await supabase.from('item_costs').upsert(hits.map((h) => ({
              item_id: h.id, purchase_cost: r.purchase_cost, replacement_value: r.replacement_value, supplier: r.supplier,
            })))
          }
          setProgress({ label: 'Updating pieces', done: ++done, total: done + upd.length })
        }
      }
      await Promise.all(Array.from({ length: 6 }, updWorker))

      // 2. add new pieces
      const all = plan.flatMap((p) => Array.from({ length: p.add }, () => p.r))
      setProgress({ label: 'Adding pieces', done: 0, total: all.length })
      for (let i = 0; i < all.length; i += 200) {
        const chunk = all.slice(i, i + 200)
        setProgress({ label: 'Adding pieces', done: i, total: all.length })
        const { data, error } = await supabase.from('items').insert(chunk.map((r) => ({
          photo_url: photos.get(r) || null,
          name: r.name, sku: r.sku, category: r.category, colour: r.colour, dimensions: r.dimensions,
          shed_location: r.shed_location, condition: r.condition, notes: r.notes,
          status: r.condition === 'needs_repair' ? 'repair' : 'available',
        }))).select('id')
        if (error) throw error
        const costs = data.map((d, k) => ({ item_id: d.id, purchase_cost: chunk[k].purchase_cost, replacement_value: chunk[k].replacement_value, supplier: chunk[k].supplier }))
          .filter((c) => c.purchase_cost !== null || c.replacement_value !== null || c.supplier)
        if (costs.length) await supabase.from('item_costs').insert(costs)
      }
      toast([toUpdate && `${toUpdate} pieces updated`, all.length && `${all.length} added`].filter(Boolean).join(', ') || 'Nothing to change')
      nav('/inventory')
    } catch (e) { toast(friendlyError(e), 'error') }
    setBusy(false); setProgress(null)
  }

  if (reading) return <div className="stack"><h1>Import stock</h1><div className="card"><p>{reading}</p><div className="progress"><i className="indeterminate" /></div></div></div>

  if (sheets && !rows) {
    return (
      <div className="stack">
        <h1>Which tab?</h1>
        <p className="muted">This file has {sheets.length} tabs. Pick the one with the stock list.</p>
        {sheets.map((s) => <button key={s.path} className="btn btn-block btn-big" onClick={() => loadSheet(s)}>{s.name}</button>)}
      </div>
    )
  }

  if (!rows) {
    return (
      <div className="stack">
        <h1>Import stock</h1>
        <p className="muted">Bring in your current spreadsheet. Every piece gets its own code and QR label. If a row says quantity 6, you get 6 pieces.</p>
        <section className="card highlight">
          <h2>Excel file with photos</h2>
          <p className="small muted">Pick the .xlsx straight from your computer. Photos in the sheet are matched to their row and attached to each piece. Big files are fine: it’s read on this device, nothing huge is uploaded. Best done on a laptop.</p>
          <label className="btn btn-primary">Choose Excel file<input type="file" accept=".xlsx,.xls" hidden onChange={onFile} /></label>
        </section>
        <section className="card">
          <h2>No photos? Paste from Excel or Google Sheets</h2>
          <p className="small muted">Select the cells including the heading row, copy, then paste here.</p>
          <textarea rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Item\tCategory\tColour\tQty\tLocation\nLinen sofa\tSofa\tOatmeal\t1\tBay 1'} />
          <button className="btn btn-primary" disabled={!paste.trim()} onClick={() => load(paste)}>Next</button>
        </section>
        <section className="card">
          <h2>Or a CSV file</h2>
          <label className="btn">Choose CSV<input type="file" accept=".csv,.txt,.tsv" hidden onChange={onFile} /></label>
        </section>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Match your columns</h1>
        <button className="btn btn-ghost" onClick={() => { setRows(null); setSheets(null); setExisting(null); book.current = null }}>Start again</button>
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
        <h2>Preview <span className="muted small">{parsed.length} rows → {pieces} pieces{book.current ? ` · ${withPhoto} with photos` : ''}</span></h2>
        {existing?.length > 0 && (
          <div className="card-soft">
            <label className="row"><input type="checkbox" className="big-check" checked={updateMode} onChange={(e) => setUpdateMode(e.target.checked)} />
              <span><strong>Update pieces already in stock</strong> (match by your item code). Keeps their photos and QR labels.</span></label>
            <p className="small" style={{ marginTop: 6 }}>{toUpdate} pieces will be updated · {toAdd} new pieces added</p>
          </div>
        )}
        {orphanPhotos > 0 && <p className="small warn-text">{orphanPhotos} photos sit on rows with no item name, so they’ll be skipped. Check the picture is placed on the same row as its item.</p>}
        {map.name === undefined && map.sku === undefined ? <p className="warn-text">Pick which column has the description.</p> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>{book.current && <th>Photo</th>}<th>Code</th><th>Description</th><th>Category</th><th>Qty</th><th>Shop</th><th>Price ea</th></tr></thead>
              <tbody>
                {parsed.slice(0, 12).map((r, i) => (
                  <tr key={i}>{book.current && <td><PreviewImg path={r.img} book={book.current} /></td>}<td>{r.sku}</td><td>{r.name}</td><td>{r.category}</td><td>{r.qty}</td><td>{r.supplier}</td><td>{r.purchase_cost ?? ''}</td></tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 12 && <p className="small muted">…and {parsed.length - 12} more rows</p>}
          </div>
        )}
      </section>

      {progress && (
        <div className="card">
          <p><strong>{progress.label}</strong> {progress.done} / {progress.total}</p>
          <div className="progress"><i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
          <p className="small muted">Keep this page open until it finishes.</p>
        </div>
      )}
      <div className="sticky-actions row">
        <button className="btn btn-primary btn-big grow" disabled={!pieces || busy || (map.name === undefined && map.sku === undefined)} onClick={run}>
          {busy ? 'Importing…' : toUpdate ? `Update ${toUpdate}${toAdd ? ` + add ${toAdd}` : ''} pieces` : `Add ${pieces} pieces to stock`}
        </button>
      </div>
    </div>
  )
}

function PreviewImg({ path, book }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let url = ''
    if (path) imageBlob(book, path).then((b) => { if (b) { url = URL.createObjectURL(b); setSrc(url) } })
    return () => url && URL.revokeObjectURL(url)
  }, [path, book])
  return src ? <img className="thumb" src={src} width={44} height={44} alt="" /> : <span className="muted small">–</span>
}
