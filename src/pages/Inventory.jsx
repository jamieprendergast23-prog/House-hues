import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase, fetchAll, naturalCompare, friendlyError } from '../lib/supabase'
import { toast } from '../lib/toast'
import { ITEM_STATUS } from '../lib/constants'
import { toCSV, downloadText } from '../lib/csv'
import { fmtDate } from '../lib/format'
import { Loading, Empty, Modal, ItemWhere, ConditionPill } from '../components/ui'
import Scanner from '../components/Scanner'
import Icon from '../components/Icon'

const WHERE = [['all', 'All'], ['in', 'In shed'], ['out', 'Out on jobs'], ['repair', 'Repair'], ['retired', 'Retired']]
const PAGE = 120 // tiles rendered at a time; "Show more" for the rest

const isIn = (i) => !i.out_address && i.status === 'available'

// Pieces with the same name + category are one product (e.g. A1 ×2)
function groupPieces(items) {
  const map = new Map()
  for (const i of items) {
    const key = `${i.category}\u0000${i.sku || ''}\u0000${i.name}`
    let g = map.get(key)
    if (!g) { g = { key, name: i.name, sku: i.sku, category: i.category, subcategory: i.subcategory, pieces: [], photo: null }; map.set(key, g) }
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
  const [subcat, setSubcat] = useState('')
  const [moveTo, setMoveTo] = useState('')
  const [where, setWhere] = useState('all')
  const [scan, setScan] = useState(false)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState(new Set()) // group keys
  const [open, setOpen] = useState(null) // group shown in the pieces sheet
  const [limit, setLimit] = useState(PAGE)
  const [view, setViewState] = useState(() => { try { return localStorage.getItem('hh-stock-view') || 'grid' } catch { return 'grid' } })
  const setView = (v) => { setViewState(v); try { localStorage.setItem('hh-stock-view', v) } catch { /* ignore */ } }

  useEffect(() => {
    fetchAll(() => supabase.from('v_items').select('*').order('code')).then(setItems)
  }, [])

  // reset paging whenever the filter changes
  useEffect(() => { setLimit(PAGE) }, [q, cat, subcat, where])
  useEffect(() => { setSubcat('') }, [cat])

  const shownPieces = useMemo(() => {
    if (!items) return []
    const s = q.trim().toLowerCase()
    return items.filter((i) => {
      if (cat && i.category !== cat) return false
      if (subcat && (i.subcategory || '') !== subcat) return false
      if (where === 'in' && !isIn(i)) return false
      if (where === 'out' && !i.out_address) return false
      if (where === 'repair' && i.status !== 'repair') return false
      if (where === 'retired' ? i.status !== 'retired' : i.status === 'retired') return false
      if (!s) return true
      return [i.name, i.sku, i.code, i.subcategory, i.colour, i.shed_location, i.category, i.description].some((v) => v?.toLowerCase().includes(s))
    })
  }, [items, q, cat, subcat, where])

  const groups = useMemo(() => {
    return groupPieces(shownPieces).sort((a, b) =>
      naturalCompare(a.category, b.category) || naturalCompare(a.subcategory, b.subcategory) || naturalCompare(a.sku, b.sku) || naturalCompare(a.name, b.name))
  }, [shownPieces])

  const cats = useMemo(() => {
    const counts = {}
    for (const i of items || []) if (i.status !== 'retired') counts[i.category] = (counts[i.category] || 0) + 1
    return Object.entries(counts).sort((a, b) => naturalCompare(a[0], b[0]))
  }, [items])

  // sub-groups for the chosen category (e.g. Furniture > Sofas & lounges)
  const subs = useMemo(() => {
    if (!cat) return []
    const counts = {}
    for (const i of items || []) if (i.category === cat && i.status !== 'retired' && i.subcategory) counts[i.subcategory] = (counts[i.subcategory] || 0) + 1
    return Object.entries(counts).sort((a, b) => (a[0] === 'To sort') - (b[0] === 'To sort') || naturalCompare(a[0], b[0]))
  }, [items, cat])
  const allSubs = useMemo(() => [...new Set((items || []).filter((i) => !cat || i.category === cat).map((i) => i.subcategory).filter(Boolean))].sort(naturalCompare), [items, cat])

  const moveSelected = async () => {
    let target = moveTo
    if (target === '__new') target = (window.prompt('New group name') || '').trim()
    if (!target) return
    const ids = groups.filter((g) => picked.has(g.key)).flatMap((g) => g.pieces.map((p) => p.id))
    for (let i = 0; i < ids.length; i += 150) {
      const { error } = await supabase.from('items').update({ subcategory: target }).in('id', ids.slice(i, i + 150))
      if (error) return toast(friendlyError(error), 'error')
    }
    const set = new Set(ids)
    setItems(items.map((i) => (set.has(i.id) ? { ...i, subcategory: target } : i)))
    toast(`Moved ${picked.size} items to ${target}`)
    setPicked(new Set()); setMoveTo('')
  }

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
          <div className="seg view-toggle" role="group" aria-label="View">
            <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} aria-label="Photo view"><Icon name="grid" size={16} /> Photos</button>
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} aria-label="List view"><Icon name="list" size={16} /> List</button>
          </div>
          <button className="btn" onClick={() => setScan(true)}>Scan</button>
          <Link className="btn btn-primary" to="/inventory/new">+ Add<span className="hide-sm"> item</span></Link>
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

      {subs.length > 0 && (
        <div className="chips subchips">
          <button className={`chip ${!subcat ? 'on' : ''}`} onClick={() => setSubcat('')}>All {cat.toLowerCase()}</button>
          {subs.map(([c, n]) => (
            <button key={c} className={`chip ${subcat === c ? 'on' : ''} ${c === 'To sort' ? 'chip-warn' : ''}`} onClick={() => setSubcat(c)}>{c} <span className="chip-n">{n}</span></button>
          ))}
        </div>
      )}

      <div className="row toolbar">
        <button className="btn btn-small btn-ghost" onClick={() => { setPicking(!picking); setPicked(new Set()) }}>
          {picking ? 'Cancel select' : 'Select'}
        </button>
        <button className="btn btn-small" onClick={printLabels}>
          Print QR labels ({picking && picked.size ? pickedPieces : shownPieces.length})
        </button>
        <button className="btn btn-small btn-ghost" onClick={exportCSV}>Export CSV</button>
        {picking && picked.size > 0 && (
          <span className="row move-to">
            <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} style={{ width: 'auto', minHeight: 38 }}>
              <option value="">Move {picked.size} to group…</option>
              {allSubs.filter((s) => s !== 'To sort').map((s) => <option key={s} value={s}>{s}</option>)}
              <option value="__new">+ New group…</option>
            </select>
            <button className="btn btn-small btn-primary" disabled={!moveTo} onClick={moveSelected}>Move</button>
          </span>
        )}
      </div>

      {groups.length === 0 ? (
        <Empty>{items.length ? 'Nothing matches.' : 'No stock yet. Tap “Add item” or Import to start.'}</Empty>
      ) : (
        <>
          {view === 'list' ? (
          <ul className="stock-list">
            {groups.slice(0, limit).map((g) => (
              <li key={g.key}>
                <button className={`sl-row ${picking && picked.has(g.key) ? 'picked' : ''}`} onClick={() => (picking ? togglePick(g) : openGroup(g))}>
                  {picking && <span className="sl-check">{picked.has(g.key) && <Icon name="check" size={14} stroke={2.4} />}</span>}
                  {g.photo ? <img className="sl-img" src={g.photo} alt="" loading="lazy" /> : <span className="sl-img sl-noimg">{g.sku || ''}</span>}
                  <span className="sl-main">
                    <span className="sl-name">{g.name}</span>
                    <span className="sl-sub">{[g.sku, g.subcategory && g.subcategory !== 'To sort' ? g.subcategory : g.category].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="sl-qty">{g.pieces.length > 1 ? `×${g.pieces.length}` : ''}</span>
                  <span className="sl-status">
                    {g.inCount > 0 && <span className="st st-in">{g.inCount} in</span>}
                    {g.outCount > 0 && <span className="st st-out">{g.outCount} out</span>}
                    {g.repairCount > 0 && <span className="st st-rep">{g.repairCount} repair</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          ) : (
          <div className="tile-grid">
            {groups.slice(0, limit).map((g) => (
              <button key={g.key} className={`tile ${picking && picked.has(g.key) ? 'picked' : ''}`}
                onClick={() => (picking ? togglePick(g) : openGroup(g))}>
                <div className="tile-img">
                  {g.photo ? <img src={g.photo} alt="" loading="lazy" /> : <span className={`tile-code ${(g.sku || g.name).length > 6 ? 'long' : ''}`}>{g.sku || g.name}</span>}
                  {g.pieces.length > 1 && <span className="tile-qty">×{g.pieces.length}</span>}
                  {picking && <span className="tile-check">{picked.has(g.key) && <Icon name="check" size={14} stroke={2.4} />}</span>}
                </div>
                <div className="tile-body">
                  <div className="tile-name">{g.name}</div>
                  <div className="tile-cat">{g.sku ? `${g.sku} · ` : ''}{g.subcategory && g.subcategory !== 'To sort' ? g.subcategory : g.category}</div>
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
          )}
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
