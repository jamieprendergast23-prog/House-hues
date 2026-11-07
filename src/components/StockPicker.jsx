import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, friendlyError, fetchAll, naturalCompare } from '../lib/supabase'
import { ROOMS, UNPLACED } from '../lib/constants'
import { fmtDate, today, addDays } from '../lib/format'
import { toast } from '../lib/toast'
import { Modal, Loading, Empty, Field } from './ui'
import Scanner from './Scanner'

/**
 * Pick furniture for a house, by look. Only shows pieces free for the job's dates:
 * in the shed now, or out at another house but due back in time.
 */
export default function StockPicker({ jobId, onClose, initialRoom, noDates = false }) {
  const [items, setItems] = useState(null)
  const [room, setRoom] = useState(initialRoom || UNPLACED)
  const [cat, setCat] = useState('')
  const [sub, setSub] = useState('')
  const [q, setQ] = useState('')
  const [want, setWant] = useState({}) // group key -> how many
  const [busy, setBusy] = useState(false)
  const [scan, setScan] = useState(false)
  const [added, setAdded] = useState(0)
  const [limit, setLimit] = useState(120)
  const [dated, setDated] = useState(!noDates)
  const [installDate, setInstallDate] = useState(addDays(today(), 14))

  const load = useCallback(() => {
    // no install date yet: show what's in the shed and free right now
    if (!dated) {
      return fetchAll(() => supabase.from('v_items').select('*').eq('status', 'available').is('out_job_id', null).is('next_job_id', null).order('code'))
        .then(setItems)
        .catch((error) => { toast(friendlyError(error), 'error'); setItems([]) })
    }
    fetchAll(() => supabase.rpc('available_items', { p_job_id: jobId }))
      .then(setItems)
      .catch((error) => { toast(friendlyError(error), 'error'); setItems([]) })
  }, [jobId, dated])
  useEffect(() => { load() }, [load])
  useEffect(() => { setSub(''); setLimit(120) }, [cat])
  useEffect(() => { setLimit(120) }, [q, sub])

  // one tile per product (A1 ×6 = one tile, "6 free")
  const groups = useMemo(() => {
    const map = new Map()
    for (const i of items || []) {
      const key = `${i.category}\u0000${i.sku || ''}\u0000${i.name}`
      let g = map.get(key)
      if (!g) { g = { key, name: i.name, sku: i.sku, category: i.category, subcategory: i.subcategory, photo: null, pieces: [] }; map.set(key, g) }
      g.pieces.push(i)
      if (!g.photo && i.photo_url) g.photo = i.photo_url
    }
    return [...map.values()].map((g) => {
      // pieces in the shed first, then the ones coming back soonest
      g.pieces.sort((a, b) => (a.out_until || '') .localeCompare(b.out_until || ''))
      const back = g.pieces.filter((p) => p.out_address)
      return { ...g, freeNow: g.pieces.length - back.length, back }
    }).sort((a, b) => naturalCompare(a.category, b.category) || naturalCompare(a.subcategory, b.subcategory) || naturalCompare(a.sku, b.sku) || naturalCompare(a.name, b.name))
  }, [items])

  const cats = useMemo(() => [...new Set(groups.map((g) => g.category))].sort(naturalCompare), [groups])
  const subs = useMemo(() => [...new Set(groups.filter((g) => g.category === cat).map((g) => g.subcategory).filter(Boolean))].sort(naturalCompare), [groups, cat])

  const shown = groups.filter((g) => {
    if (cat && g.category !== cat) return false
    if (sub && g.subcategory !== sub) return false
    const s = q.trim().toLowerCase()
    return !s || [g.name, g.sku, g.category, g.subcategory, g.pieces[0].colour].some((v) => v?.toLowerCase().includes(s))
  })

  const setCount = (g, n) => setWant((w) => {
    const next = { ...w }
    const v = Math.max(0, Math.min(g.pieces.length, n))
    if (v) next[g.key] = v; else delete next[g.key]
    return next
  })

  const chosenIds = Object.entries(want).flatMap(([k, n]) => (groups.find((g) => g.key === k)?.pieces || []).slice(0, n).map((p) => p.id))

  const add = async (ids) => {
    if (!ids.length) return
    setBusy(true)
    if (!dated) {
      // pieces are held from the install date, so save it first
      const { error: e1 } = await supabase.from('jobs').update({ install_date: installDate }).eq('id', jobId)
      if (e1) { setBusy(false); return toast(friendlyError(e1), 'error') }
      setDated(true)
    }
    const { error } = await supabase.from('job_items').insert(ids.map((item_id) => ({ job_id: jobId, item_id, room })))
    setBusy(false)
    if (error) { toast(friendlyError(error), 'error'); load(); return }
    setAdded((n) => n + ids.length)
    setWant({}); load()
    toast(room === UNPLACED ? `${ids.length} added to the house. Choose rooms next.` : `${ids.length} added to ${room}`)
  }

  const onScan = async (code) => {
    const { data: it } = await supabase.from('items').select('id, name').eq('code', code).maybeSingle()
    if (!it) return toast(`${code} not found`, 'error')
    if (!(items || []).some((i) => i.id === it.id)) return toast(`${it.name} isn’t free for these dates (or already added)`, 'error')
    await add([it.id])
  }

  return (
    <Modal title="Pick furniture" onClose={onClose} wide>
      <div className="picker-filters">
        <Field label="Goes in">
          <select value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value={UNPLACED}>Choose rooms later</option>
            {[...new Set([...(initialRoom && initialRoom !== UNPLACED ? [initialRoom] : []), ...ROOMS])].map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        {subs.length > 0 && (
          <Field label="Group">
            <select value={sub} onChange={(e) => setSub(e.target.value)}>
              <option value="">All {cat.toLowerCase()}</option>
              {subs.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        )}
      </div>
      <div className="row">
        <input className="search grow" placeholder="Search code, description, colour…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn" onClick={() => setScan(true)}>Scan</button>
      </div>
      {!dated && (
        <div className="note small row">
          <span className="grow">No install date on this house yet, so this shows what’s in the shed now. Pieces are held from:</span>
          <input type="date" value={installDate} min={today()} onChange={(e) => setInstallDate(e.target.value)} style={{ width: 'auto' }} />
        </div>
      )}
      <p className="small muted">
        Everything here is free for this house’s dates: in the shed now, or <span className="back-dot">due back</span> from another house in time.
        {added > 0 && ` ${added} added so far.`}
      </p>

      {!items ? <Loading /> : shown.length === 0 ? <Empty>Nothing free matches.</Empty> : (
        <div className="pick-grid">
          {shown.slice(0, limit).map((g) => {
            const n = want[g.key] || 0
            const soonest = g.back[0]
            return (
              <div key={g.key} className={`pg-tile ${n ? 'on' : ''}`}>
                <button type="button" className="pg-img" onClick={() => setCount(g, n ? 0 : 1)}>
                  {g.photo ? <img src={g.photo} alt="" loading="lazy" /> : <span className="tile-code">{g.sku || g.name}</span>}
                  {n > 0 && <span className="pg-check">✓</span>}
                  <span className="pg-free">{g.pieces.length} free</span>
                </button>
                <div className="pg-body">
                  <div className="pg-name">{g.name}</div>
                  <div className="pg-sub">{[g.sku, g.subcategory || g.category].filter(Boolean).join(' · ')}</div>
                  {g.freeNow === 0 && soonest && <div className="pg-back">Back from {soonest.out_address} {fmtDate(soonest.out_until)}</div>}
                  {g.freeNow > 0 && g.back.length > 0 && <div className="pg-back">{g.freeNow} in shed · {g.back.length} due back</div>}
                  {g.pieces.length > 1 && (
                    <div className="pg-step">
                      <button type="button" onClick={() => setCount(g, n - 1)} disabled={!n} aria-label="One less">−</button>
                      <span>{n}</span>
                      <button type="button" onClick={() => setCount(g, n + 1)} disabled={n >= g.pieces.length} aria-label="One more">+</button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {shown.length > limit && <button type="button" className="btn btn-block" onClick={() => setLimit(limit + 240)}>Show more ({shown.length - limit} left)</button>}

      <div className="row sticky-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Done</button>
        <button type="button" className="btn btn-primary grow" disabled={!chosenIds.length || busy} onClick={() => add(chosenIds)}>
          Add {chosenIds.length || ''} to {room === UNPLACED ? 'house' : room}
        </button>
      </div>
      {scan && (
        <Scanner continuous title={room === UNPLACED ? 'Scan to add to this house' : `Scan to add to ${room}`} onClose={() => setScan(false)} onCode={onScan} />
      )}
    </Modal>
  )
}
