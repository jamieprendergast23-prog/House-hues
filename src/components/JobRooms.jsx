import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, friendlyError } from '../lib/supabase'
import { ROOMS, UNPLACED } from '../lib/constants'
import { compressImage } from '../lib/format'
import { toast } from '../lib/toast'
import { Thumb, Empty } from './ui'
import PhotoViewer from './PhotoViewer'
import DesignImport from './DesignImport'
import Icon from './Icon'

const roomOrder = (r) => { const k = ROOMS.indexOf(r); return k < 0 ? 50 : k }

/**
 * Rooms on a job: site photos, design renders and the furniture for each room.
 * The design renders are what the crew see at the top of each room on the pick list.
 */
export default function JobRooms({ jobId, lines, onAddFurniture, onRemoveLine, onOpenPickList, packedCount, onLinesChanged }) {
  const [photos, setPhotos] = useState([])
  const [extra, setExtra] = useState([])
  const [busy, setBusy] = useState('')
  const [viewer, setViewer] = useState(null)
  const [newRoom, setNewRoom] = useState(null)
  const [importing, setImporting] = useState(false)
  const [picked, setPicked] = useState(new Set())
  const [moving, setMoving] = useState(false)

  const load = useCallback(() => {
    supabase.from('job_photos').select('*').eq('job_id', jobId).order('created_at').then(({ data }) => setPhotos(data || []))
  }, [jobId])
  useEffect(() => { load() }, [load])

  const rooms = useMemo(() => {
    const set = new Set([...lines.map((l) => l.room), ...photos.map((p) => p.room), ...extra])
    set.delete(UNPLACED)
    return [...set].sort((a, b) => roomOrder(a) - roomOrder(b) || a.localeCompare(b))
  }, [lines, photos, extra])

  const unplaced = lines.filter((l) => l.room === UNPLACED)

  // put pieces into a room (from "not in a room yet", or move between rooms)
  const assign = async (ids, room) => {
    if (!ids.length) return
    setMoving(true)
    const { error } = await supabase.from('job_items').update({ room }).in('id', ids)
    setMoving(false)
    if (error) return toast(friendlyError(error), 'error')
    if (!rooms.includes(room)) setExtra((x) => [...x, room])
    setPicked(new Set())
    toast(`${ids.length} piece${ids.length > 1 ? 's' : ''} → ${room}`)
    onLinesChanged?.()
  }
  const roomChoices = [...new Set([...rooms, ...ROOMS])]

  const upload = async (room, kind, files) => {
    if (!files?.length) return
    setBusy(`${room}-${kind}`)
    let ok = 0
    for (const f of files) {
      try {
        const blob = await compressImage(f, kind === 'design' ? 2000 : 1600, 0.85)
        const path = `jobs/${jobId}/${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from('item-photos').upload(path, blob, { contentType: 'image/jpeg' })
        if (error) throw error
        const url = supabase.storage.from('item-photos').getPublicUrl(path).data.publicUrl
        const { error: e2 } = await supabase.from('job_photos').insert({ job_id: jobId, room, kind, url })
        if (e2) throw e2
        ok++
      } catch (e) { toast(friendlyError(e), 'error') }
    }
    setBusy('')
    if (ok) toast(`${ok} photo${ok > 1 ? 's' : ''} added to ${room}`)
    load()
  }

  const removePhoto = async (p) => {
    if (!confirm('Remove this photo?')) return
    const { error } = await supabase.from('job_photos').delete().eq('id', p.id)
    if (error) return toast(friendlyError(error), 'error')
    setPhotos(photos.filter((x) => x.id !== p.id))
  }

  const addRoom = (name) => {
    const r = name.trim()
    if (r && !rooms.includes(r)) setExtra([...extra, r])
    setNewRoom(null)
  }

  const strip = (room, kind) => {
    const list = photos.filter((p) => p.room === room && p.kind === kind)
    const key = `${room}-${kind}`
    return (
      <div className="photo-strip">
        {list.map((p, i) => (
          <div key={p.id} className="ps-item">
            <button type="button" className="ps-img" onClick={() => setViewer({ photos: list.map((x) => ({ url: x.url, label: `${room} · ${kind === 'design' ? 'design' : kind === 'after' ? 'styled' : 'before'}` })), start: i })}>
              <img src={p.url} alt="" loading="lazy" />
            </button>
            <button type="button" className="ps-del" onClick={() => removePhoto(p)} aria-label="Remove photo"><Icon name="close" size={14} stroke={2} /></button>
          </div>
        ))}
        <label className={`ps-add ${busy === key ? 'busy' : ''}`}>
          {busy === key ? 'Uploading…' : kind === 'design' ? '+ Design' : kind === 'after' ? '+ After photo' : '+ Site photo'}
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; upload(room, kind, f) }} />
        </label>
      </div>
    )
  }

  return (
    <section className="card">
      <div className="row between">
        <h2>Rooms &amp; furniture <span className="muted small">{lines.length} pieces · {packedCount} packed</span></h2>
      </div>
      <p className="small muted">For each room: site photos from the visit, the design (screenshots or renders from your planner), and the furniture. The crew see the design at the top of each room on their pick list.</p>

      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => onAddFurniture(UNPLACED)}>+ Pick furniture for this house</button>
        <button type="button" className="btn" onClick={() => setNewRoom('')}>+ Add room</button>
        <button type="button" className="btn" onClick={() => setImporting(true)}>Import design list</button>
        <button type="button" className="btn" onClick={onOpenPickList}>Open pick list</button>
      </div>
      {newRoom !== null && (
        <div className="room-picker">
          {ROOMS.filter((r) => !rooms.includes(r)).map((r) => <button type="button" key={r} className="chip" onClick={() => addRoom(r)}>{r}</button>)}
          <input placeholder="Other room name" value={newRoom} onChange={(e) => setNewRoom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRoom(newRoom) } }} />
          <button type="button" className="btn btn-small" onClick={() => addRoom(newRoom)} disabled={!newRoom.trim()}>Add</button>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setNewRoom(null)}>Cancel</button>
        </div>
      )}

      {unplaced.length > 0 && (
        <div className="room-block unplaced">
          <h3 className="room">Not in a room yet <span className="muted small">{unplaced.length} pieces</span></h3>
          <p className="small muted">Tick pieces, then tap the room they go in. Or choose a room on each line.</p>
          <div className="row">
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setPicked(picked.size === unplaced.length ? new Set() : new Set(unplaced.map((l) => l.id)))}>
              {picked.size === unplaced.length ? 'Clear' : 'Select all'}
            </button>
            {picked.size > 0 && <span className="small"><b>{picked.size}</b> selected → put in:</span>}
          </div>
          {picked.size > 0 && (
            <div className="chips room-chips">
              {roomChoices.map((r) => <button type="button" key={r} className="chip" disabled={moving} onClick={() => assign([...picked], r)}>{r}</button>)}
            </div>
          )}
          <ul className="list">
            {unplaced.map((l) => (
              <li key={l.id} className="list-row">
                <input type="checkbox" className="big-check" checked={picked.has(l.id)}
                  onChange={() => { const n = new Set(picked); n.has(l.id) ? n.delete(l.id) : n.add(l.id); setPicked(n) }} />
                <Thumb url={l.items.photo_url} size={48} />
                <div className="grow">
                  <div className="row-title">{l.items.name}</div>
                  <div className="row-sub">{[l.items.sku, l.items.code].filter(Boolean).join(' · ')}</div>
                </div>
                <select value="" onChange={(e) => e.target.value && assign([l.id], e.target.value)} style={{ width: 'auto', minHeight: 38 }} disabled={moving}>
                  <option value="">Room…</option>
                  {roomChoices.map((r) => <option key={r}>{r}</option>)}
                </select>
                {!l.packed_at && <button type="button" className="btn btn-ghost btn-small" onClick={() => onRemoveLine(l.id)} aria-label="Remove"><Icon name="close" size={16} /></button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rooms.length === 0 && unplaced.length === 0 && <Empty>Pick the furniture for this house, then choose the room for each piece.</Empty>}

      {rooms.map((room) => {
        const ls = lines.filter((l) => l.room === room)
        return (
          <div key={room} className="room-block">
            <h3 className="room">{room} <span className="muted small">{ls.length} pieces</span></h3>
            <div className="room-photos">
              <div><div className="field-label">Design</div>{strip(room, 'design')}</div>
              <div><div className="field-label">Site photos (before)</div>{strip(room, 'site')}</div>
              <div><div className="field-label">Styled photos (after)</div>{strip(room, 'after')}</div>
            </div>
            {ls.length > 0 && (
              <ul className="list">
                {ls.map((l) => (
                  <li key={l.id} className="list-row">
                    <Thumb url={l.items.photo_url} size={44} />
                    <div className="grow">
                      <Link to={`/inventory/${l.items.id}`} className="row-title">{l.items.name}</Link>
                      <div className="row-sub">{[l.items.sku, l.items.code].filter(Boolean).join(' · ')} · {l.returned_at ? 'Back in shed' : l.packed_at ? 'Packed / out' : `Shed ${l.items.shed_location || '—'}`}</div>
                    </div>
                    <select value={l.room} onChange={(e) => assign([l.id], e.target.value)} style={{ width: 'auto', minHeight: 36, fontSize: '.85rem', padding: '4px 8px' }} disabled={moving} aria-label="Move to room">
                      {[...new Set([l.room, ...roomChoices, UNPLACED])].map((r) => <option key={r} value={r}>{r === UNPLACED ? 'No room' : r}</option>)}
                    </select>
                    {!l.packed_at && <button type="button" className="btn btn-ghost btn-small" onClick={() => onRemoveLine(l.id)}>Remove</button>}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn btn-small" onClick={() => onAddFurniture(room)}>+ Add furniture to {room}</button>
          </div>
        )
      })}

      {importing && (
        <DesignImport jobId={jobId} rooms={rooms} onClose={() => setImporting(false)}
          onDone={() => { setImporting(false); onLinesChanged?.() }} />
      )}
      {viewer && <PhotoViewer photos={viewer.photos} start={viewer.start} onClose={() => setViewer(null)} />}
    </section>
  )
}
