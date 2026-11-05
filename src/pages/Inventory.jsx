import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { toCSV, downloadText } from '../lib/csv'
import { supabase } from '../lib/supabase'
import { CATEGORIES } from '../lib/constants'
import { Thumb, ItemWhere, ConditionPill, Loading, Empty } from '../components/ui'
import Scanner from '../components/Scanner'

const WHERE = [['all', 'All'], ['in', 'In shed'], ['out', 'Out on jobs'], ['repair', 'Repair'], ['retired', 'Retired']]

export default function Inventory() {
  const nav = useNavigate()
  const loc = useLocation()
  const [items, setItems] = useState(null)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState(loc.state?.cat || '')
  const [where, setWhere] = useState('all')
  const [scan, setScan] = useState(false)
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState(new Set())

  useEffect(() => {
    supabase.from('v_items').select('*').order('category').order('name')
      .then(({ data }) => setItems(data || []))
  }, [])

  const shown = useMemo(() => {
    if (!items) return []
    const s = q.trim().toLowerCase()
    return items.filter((i) => {
      if (cat && i.category !== cat) return false
      if (where === 'in' && (i.out_address || i.status !== 'available')) return false
      if (where === 'out' && !i.out_address) return false
      if (where === 'repair' && i.status !== 'repair') return false
      if (where === 'retired' ? i.status !== 'retired' : (where === 'all' && i.status === 'retired')) return false
      if (!s) return true
      return [i.name, i.code, i.colour, i.shed_location, i.category].some((v) => v?.toLowerCase().includes(s))
    })
  }, [items, q, cat, where])

  const usedCats = useMemo(() => {
    const set = new Set((items || []).map((i) => i.category))
    return CATEGORIES.filter((c) => set.has(c)).concat([...set].filter((c) => !CATEGORIES.includes(c)))
  }, [items])

  const toggle = (id) => {
    const n = new Set(picked)
    n.has(id) ? n.delete(id) : n.add(id)
    setPicked(n)
  }

  const printLabels = () => {
    const ids = picking && picked.size ? [...picked] : shown.map((i) => i.id)
    sessionStorage.setItem('hh-labels', JSON.stringify(ids))
    nav('/labels')
  }

  const exportCSV = () => {
    const rows = shown.map((i) => ({
      Code: i.code, Name: i.name, Category: i.category, Colour: i.colour || '', Size: i.dimensions || '',
      'Shed spot': i.shed_location || '', Condition: i.condition, Status: i.status,
      'Out at': i.out_address || '', 'Next job': i.next_address || '', 'Next date': i.next_start || '',
    }))
    downloadText(`stock-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows))
  }

  if (!items) return <Loading />

  return (
    <div>
      <div className="page-head">
        <h1>Stock <span className="muted small">{shown.length} of {items.filter(i => i.status !== 'retired').length}</span></h1>
        <div className="row">
          <button className="btn" onClick={() => setScan(true)}>Scan</button>
          <Link className="btn btn-primary" to="/inventory/new">+ Add item</Link>
        </div>
      </div>

      <input className="search" placeholder="Search name, code, colour, shed spot…" value={q}
        onChange={(e) => setQ(e.target.value)} />

      <div className="chips">
        {WHERE.map(([k, l]) => (
          <button key={k} className={`chip ${where === k ? 'on' : ''}`} onClick={() => setWhere(k)}>{l}</button>
        ))}
      </div>
      {usedCats.length > 1 && (
        <div className="chips">
          <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>Every category</button>
          {usedCats.map((c) => (
            <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      )}

      <div className="row toolbar">
        <button className="btn btn-small btn-ghost" onClick={() => { setPicking(!picking); setPicked(new Set()) }}>
          {picking ? 'Cancel select' : 'Select'}
        </button>
        <button className="btn btn-small" onClick={printLabels}>
          Print QR labels ({picking && picked.size ? picked.size : shown.length})
        </button>
        <button className="btn btn-small btn-ghost" onClick={exportCSV}>Export CSV</button>
      </div>

      {shown.length === 0 ? (
        <Empty>{items.length ? 'Nothing matches.' : 'No stock yet. Tap “Add item” to start.'}</Empty>
      ) : (
        <ul className="list">
          {shown.map((i) => (
            <li key={i.id}>
              {picking ? (
                <label className="list-row">
                  <input type="checkbox" className="big-check" checked={picked.has(i.id)} onChange={() => toggle(i.id)} />
                  <ItemRow i={i} />
                </label>
              ) : (
                <Link className="list-row" to={`/inventory/${i.id}`}><ItemRow i={i} /></Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {scan && (
        <Scanner onClose={() => setScan(false)} onCode={(code) => { setScan(false); nav(`/i/${code}`) }} />
      )}
    </div>
  )
}

function ItemRow({ i }) {
  return (
    <>
      <Thumb url={i.photo_url} />
      <div className="grow">
        <div className="row-title">{i.name}</div>
        <div className="row-sub">{i.code} · {i.category}{i.colour ? ` · ${i.colour}` : ''}</div>
        <div className="row-pills"><ItemWhere item={i} /><ConditionPill c={i.condition} /></div>
      </div>
    </>
  )
}
