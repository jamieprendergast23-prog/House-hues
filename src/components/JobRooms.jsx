import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, friendlyError } from '../lib/supabase'
import { ROOMS } from '../lib/constants'
import { compressImage } from '../lib/format'
import { toast } from '../lib/toast'
import { Thumb, Empty } from './ui'
import PhotoViewer from './PhotoViewer'

const roomOrder = (r) => { const k = ROOMS.indexOf(r); return k < 0 ? 50 : k }

/**
 * Rooms on a job: site photos, design renders and the furniture for each room.
 * The design renders are what the crew see at the top of each room on the pick list.
 */
export default function JobRooms({ jobId, lines, canAddFurniture, onAddFurniture, onRemoveLine, onOpenPickList, packedCount }) {
  const [photos, setPhotos] = useState([])
  const [extra, setExtra] = useState([])
  const [busy, setBusy] = useState('')
  const [viewer, setViewer] = useState(null)
  const [newRoom, setNewRoom] = useState(null)

  const load = useCallback(() => {
    supabase.from('job_photos').select('*').eq('job_id', jobId).order('created_at').then(({ data }) => setPhotos(data || []))
  }, [jobId])
  useEffect(() => { load() }, [load])

  const rooms = useMemo(() => {
    const set = new Set([...lines.map((l) => l.room), ...photos.map((p) => p.room), ...extra])
    return [...set].sort((a, b) => roomOrder(a) - roomOrder(b) || a.localeCompare(b))
  }, [lines, photos, extra])

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
    if (ok) toast(`${ok} ${kind === 'design' ? 'design' : 'site'} photo${ok > 1 ? 's' : ''} added to ${room}`)
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
            <button type="button" className="ps-img" onClick={() => setViewer({ photos: list.map((x) => ({ url: x.url, label: `${room} · ${kind === 'design' ? 'design' : 'site'}` })), start: i })}>
              <img src={p.url} alt="" loading="lazy" />
            </button>
            <button type="button" className="ps-del" onClick={() => removePhoto(p)} aria-label="Remove photo">✕</button>
          </div>
        ))}
        <label className={`ps-add ${busy === key ? 'busy' : ''}`}>
          {busy === key ? 'Uploading…' : kind === 'design' ? '+ Design' : '+ Site photo'}
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
        <button type="button" className="btn" onClick={() => setNewRoom('')}>+ Add room</button>
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

      {rooms.length === 0 && <Empty>No rooms yet. Add the rooms you’re styling.</Empty>}

      {rooms.map((room) => {
        const ls = lines.filter((l) => l.room === room)
        return (
          <div key={room} className="room-block">
            <h3 className="room">{room} <span className="muted small">{ls.length} pieces</span></h3>
            <div className="room-photos">
              <div><div className="field-label">Design</div>{strip(room, 'design')}</div>
              <div><div className="field-label">Site photos</div>{strip(room, 'site')}</div>
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
                    {!l.packed_at && <button type="button" className="btn btn-ghost btn-small" onClick={() => onRemoveLine(l.id)}>Remove</button>}
                  </li>
                ))}
              </ul>
            )}
            {canAddFurniture
              ? <button type="button" className="btn btn-small" onClick={() => onAddFurniture(room)}>+ Add furniture to {room}</button>
              : <p className="small muted">Add a packing or install date (and save) to add furniture.</p>}
          </div>
        )
      })}

      {viewer && <PhotoViewer photos={viewer.photos} start={viewer.start} onClose={() => setViewer(null)} />}
    </section>
  )
}
