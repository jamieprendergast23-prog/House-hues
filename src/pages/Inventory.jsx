import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase, fetchAll, naturalCompare } from '../lib/supabase'
import { ITEM_STATUS } from '../lib/constants'
import { toCSV, downloadText } from '../lib/csv'
import { fmtDate } from '../lib/format'
import { Loading, Empty, Modal, ItemWhere, ConditionPill } from '../components/ui'
import Scanner from '../components/Scanner'

const WHERE = [['all', 'All'], ['in', 'In shed'], ['out', 'Out on jobs'], ['repair', 'Repair'], ['retired', 'Retired']]
const PAGE = 120 // tiles rendered at a time; "Show more" for the rest

const isIn = (i) => !i.out_address && i.status === 'available'

// Pieces with the same name + category are one product (e.g. A1 ×2)
function groupPieces(items) {
  const map = new Map()
  for (const i of items) {
    const key = `${i.category}\u0000${i.sku || ''}\u0000${i.name}`
    let g = map.get(key)
    if (!g) { g = { key, name: i.name, sku: i.sku, category: i.category, pieces: [], photo: null }; map.set(key, g) }
    g.pieces.push(i)
    if (!g.photo && i.photo_url) g.photo = i.photo_url
  }
  return [...map.values()].map((g) => ({
    ...g,
    pieces: g.pieces.sort((a, b) => naturalCompare(a.code, b.code)),
    inCount: g.pieces.filter(isIn).length,
    outCount: g.pieces.filter((i) => i.out_address).length,
    repairCount: g.pieces.filter((i) => i.status === 'repair').length,
  }))
}

export default function Inventory() {
  const nav = useNavigate()
  const loc = useLocation()
  const [items, setItems] = useState(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState(loc.state?.cat || '')
  const [where, setWhere] = useState('all')
  const [scan, setScan] = useState(false)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState(new Set()) // group keys
  const [open, setOpen] = useState(null) // group shown in the pieces sheet
  const [limit, setLimit] = useState(PAGE)

  useEffect(() => {
    fetchAll(() => supabase.from('v_items').select('*').order('code')).then(setItems)
  }, [])

  // reset paging whenever the filter changes
  useEffect(() => { setLimit(PAGE) }, [q, cat, where])

  const shownPieces = useMemo(() => {
    if (!items) return []
    const s = q.trim().toLowerCase()
    return items.filter((i) => {
      if (cat && i.category !== cat) return false
      if (where === 'in' && !isIn(i)) return false
      if (where === 'out' && !i.out_address) return false
      if (where === 'repair' && i.status !== 'repair') return false
      if (where === 'retired' ? i.status !== 'retired' : i.status === 'retired') return false
      if (!s) return true
      return [i.name, i.sku, i.code, i.colour, i.shed_location, i.category, i.description].some((v) => v?.toLowerCase().includes(s))
    })
  }, [items, q, cat, where])

  const groups = useMemo(() => {
    return groupPieces(shownPieces).sort((a, b) =>
      naturalCompare(a.category, b.category) || naturalCompare(a.sku, b.sku) || naturalCompare(a.name, b.name))
  }, [shownPieces])

  const cats = useMemo(() => {
    const counts = {}
    for (const i of items || []) if (i.status !== 'retired') counts[i.category] = (counts[i.category] || 0) + 1
    return Object.entries(counts).sort((a, b) => naturalCompare(a[0], b[0]))
  }, [items])

  const togglePick = (g) => {
    const n = new Set(picked)
    n.has(g.key) ? n.delete(g.key) : n.add(g.key)
    setPicked(n)
  }

  const printLabels = () => {
    const src = picking && picked.size ? groups.filter((g) => picked.has(g.key)) : groups
    sessionStorage.setItem('hh-labels', JSON.stringify(src.flatMap((g) => g.pieces.map((p) => p.id))))
    nav('/labels')
  }

  const exportCSV = () => {
    const rows = shownPieces.map((i) => ({
      Code: i.code, 'Your code': i.sku || '', Description: i.name, Category: i.category, Colour: i.colour || '', Size: i.dimensions || '',
      'Shed spot': i.shed_location || '', Condition: i.condition, Status: i.status,
      'Out at': i.out_address || '', 'Next job': i.next_address || '', 'Next date': i.next_start || '',
    }))
    downloadText(`stock-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows))
  }

  const openGroup = (g) => (g.pieces.length === 1 ? nav(`/inventory/${g.pieces[0].id}`) : setOpen(g))

  if (!items) return <Loading />

  const live = items.filter((i) => i.status !== 'retired').length
  const pickedPieces = groups.filter((g) => picked.has(g.key)).reduce((n, g) => n + g.pieces.length, 0)

  return (
    <div className="stock-page">
      <div className="page-head">
        <h1>Stock <span className="muted small">{groups.length} items · {shownPieces.length} pieces{shownPieces.length !== live ? ` of ${live}` : ''}</span></h1>
        <div className="row">
          <button className="btn" onClick={() => setScan(true)}>Scan</button>
          <Link className="btn btn-primary" to="/inventory/new">+ Add item</Link>
        </div>
      </div>

      <input className="search" placeholder="Search code, name, colour, shed spot…" value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="chips">
        {WHERE.map(([k, l]) => (
          <button key={k} className={`chip ${where === k ? 'on' : ''}`} onClick={() => setWhere(k)}>{l}</button>
        ))}
      </div>
      <div className="chips">
        <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>Every category</button>
        {cats.map(([c, n]) => (
          <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c} <span className="chip-n">{n}</span></button>
        ))}
      </div>

      <div className="row toolbar">
        <button className="btn btn-small btn-ghost" onClick={() => { setPicking(!picking); setPicked(new Set()) }}>
          {picking ? 'Cancel select' : 'Select'}
        </button>
        <button className="btn btn-small" onClick={printLabels}>
          Print QR labels ({picking && picked.size ? pickedPieces : shownPieces.length})
        </button>
        <button className="btn btn-small btn-ghost" onClick={exportCSV}>Export CSV</button>
      </div>

      {groups.length === 0 ? (
        <Empty>{items.length ? 'Nothing matches.' : 'No stock yet. Tap “Add item” or Import to start.'}</Empty>
      ) : (
        <>
          <div className="tile-grid">
            {groups.slice(0, limit).map((g) => (
              <button key={g.key} className={`tile ${picking && picked.has(g.key) ? 'picked' : ''}`}
                onClick={() => (picking ? togglePick(g) : openGroup(g))}>
                <div className="tile-img">
                  {g.photo ? <img src={g.photo} alt="" loading="lazy" /> : <span className={`tile-code ${(g.sku || g.name).length > 6 ? 'long' : ''}`}>{g.sku || g.name}</span>}
                  {g.pieces.length > 1 && <span className="tile-qty">×{g.pieces.length}</span>}
                  {picking && <span className="tile-check">{picked.has(g.key) ? '✓' : ''}</span>}
                </div>
                <div className="tile-body">
                  <div className="tile-name">{g.name}</div>
                  <div className="tile-cat">{g.sku ? `${g.sku} · ` : ''}{g.category}</div>
                  <div className="tile-status">
                    {g.inCount > 0 && <span className="st st-in">{g.inCount} in</span>}
                    {g.outCount > 0 && <span className="st st-out">{g.outCount} out</span>}
                    {g.repairCount > 0 && <span className="st st-rep">{g.repairCount} repair</span>}
                    {where === 'retired' && <span className="st">retired</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {groups.length > limit && (
            <button className="btn btn-block" onClick={() => setLimit(limit + PAGE * 2)}>
              Show more ({groups.length - limit} left)
            </button>
          )}
        </>
      )}

      {open && (
        <Modal title={open.name} onClose={() => setOpen(null)}>
          {open.photo && <img className="sheet-photo" src={open.photo} alt="" />}
          <p className="muted small">{[open.sku, open.category, `${open.pieces.length} pieces`].filter(Boolean).join(' · ')}. Each piece has its own QR code.</p>
          <ul className="list">
            {open.pieces.map((p) => (
              <li key={p.id}>
                <Link className="list-row" to={`/inventory/${p.id}`}>
                  <div className="grow">
                    <div className="row-title">{p.code}</div>
                    <div className="row-pills"><ItemWhere item={p} /><ConditionPill c={p.condition} />
                      {p.status !== 'available' && p.status !== 'repair' && <span className="pill pill-muted">{ITEM_STATUS[p.status]}</span>}
                    </div>
                    {p.next_address && <div className="row-sub">Next: {p.next_address} from {fmtDate(p.next_start)}</div>}
                  </div>
                  <span className="muted">›</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="row">
            <button className="btn" onClick={() => {
              sessionStorage.setItem('hh-labels', JSON.stringify(open.pieces.map((p) => p.id))); nav('/labels')
            }}>Print {open.pieces.length} labels</button>
          </div>
        </Modal>
      )}

      {scan && (
        <Scanner onClose={() => setScan(false)} onCode={(code) => { setScan(false); nav(`/i/${code}`) }} />
      )}
    </div>
  )
}
