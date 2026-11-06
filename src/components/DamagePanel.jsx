import { useCallback, useEffect, useState } from 'react'
import { supabase, friendlyError } from '../lib/supabase'
import { compressImage } from '../lib/format'
import { toast } from '../lib/toast'

const when = (ts) => new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Damage & repairs for one item: report (with photo), mark repaired (admin), history.
 * onChange(newFields) lets the page update its own copy of the item.
 */
export default function DamagePanel({ item, isAdmin, onChange }) {
  const [events, setEvents] = useState(null)
  const [mode, setMode] = useState(null) // report | repair
  const [note, setNote] = useState('')
  const [severity, setSeverity] = useState('needs_repair')
  const [photo, setPhoto] = useState(null) // { blob, url }
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    supabase.from('item_events').select('*, profiles(full_name)').eq('item_id', item.id).order('created_at', { ascending: false })
      .then(({ data }) => setEvents(data || []))
  }, [item.id])
  useEffect(() => { load() }, [load])

  const pickPhoto = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const blob = await compressImage(f, 1200, 0.8)
    setPhoto({ blob, url: URL.createObjectURL(blob) })
  }

  const reset = () => { setMode(null); setNote(''); setPhoto(null); setSeverity('needs_repair') }

  const report = async () => {
    setBusy(true)
    try {
      let photoUrl = null
      if (photo) {
        const path = `damage/${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from('item-photos').upload(path, photo.blob, { contentType: 'image/jpeg' })
        if (error) throw error
        photoUrl = supabase.storage.from('item-photos').getPublicUrl(path).data.publicUrl
      }
      const { error } = await supabase.rpc('flag_item', { p_item_id: item.id, p_condition: severity, p_note: note, p_photo: photoUrl })
      if (error) throw error
      onChange?.({ condition: severity, status: severity === 'needs_repair' ? 'repair' : item.status })
      toast(severity === 'needs_repair' ? 'Reported. Taken out of use until repaired.' : 'Noted. Still available to use.')
      reset(); load()
    } catch (e) { toast(friendlyError(e), 'error') }
    setBusy(false)
  }

  const repaired = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('mark_repaired', { p_item_id: item.id, p_note: note })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    onChange?.({ condition: 'good', status: item.status === 'repair' ? 'available' : item.status })
    toast('Marked repaired, back in use')
    reset(); load()
  }

  const damaged = item.condition !== 'good'

  return (
    <section className={`card damage ${item.condition === 'needs_repair' ? 'is-out' : damaged ? 'is-minor' : ''}`}>
      <div className="row between">
        <h2>Damage &amp; repairs</h2>
        <span className={`pill ${item.condition === 'needs_repair' ? 'pill-warn' : damaged ? 'pill-out' : 'pill-in'}`}>
          {item.condition === 'needs_repair' ? 'Needs repair · out of use' : damaged ? 'Minor damage · still in use' : 'Good'}
        </span>
      </div>

      {!mode && (
        <div className="row">
          <button className="btn" onClick={() => setMode('report')}>Report damage</button>
          {isAdmin && damaged && <button className="btn btn-primary" onClick={() => setMode('repair')}>Mark repaired</button>}
        </div>
      )}

      {mode === 'report' && (
        <div className="stack">
          <label className="field"><span className="field-label">What’s wrong?</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Chip on the rim, stain on left cushion" autoFocus /></label>
          <div className="seg seg-big">
            <button className={severity === 'fair' ? 'on' : ''} onClick={() => setSeverity('fair')}>Still usable</button>
            <button className={severity === 'needs_repair' ? 'on' : ''} onClick={() => setSeverity('needs_repair')}>Needs repair</button>
          </div>
          <p className="small muted">{severity === 'needs_repair' ? 'It won’t be offered for jobs until it’s marked repaired.' : 'It stays available; the damage is just noted.'}</p>
          <div className="row">
            {photo ? <img className="damage-thumb" src={photo.url} alt="" /> : null}
            <label className="btn">{photo ? 'Retake photo' : 'Add photo'}<input type="file" accept="image/*" capture="environment" hidden onChange={pickPhoto} /></label>
          </div>
          <div className="row">
            <button className="btn btn-ghost" onClick={reset}>Cancel</button>
            <button className="btn btn-primary grow" disabled={busy || (!note.trim() && !photo)} onClick={report}>{busy ? 'Saving…' : 'Save report'}</button>
          </div>
        </div>
      )}

      {mode === 'repair' && (
        <div className="stack">
          <label className="field"><span className="field-label">What was done? (optional)</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Re-covered cushion, touched up paint" autoFocus /></label>
          <div className="row">
            <button className="btn btn-ghost" onClick={reset}>Cancel</button>
            <button className="btn btn-primary grow" disabled={busy} onClick={repaired}>{busy ? 'Saving…' : 'Mark repaired'}</button>
          </div>
        </div>
      )}

      {events?.length > 0 && (
        <ul className="damage-log">
          {events.map((e) => (
            <li key={e.id} className={`dl-${e.kind}`}>
              <div className="dl-head">
                <b>{e.kind === 'repaired' ? 'Repaired' : e.severity === 'fair' ? 'Minor damage' : 'Damage, needs repair'}</b>
                <span className="muted small">{when(e.created_at)}{e.profiles?.full_name ? ` · ${e.profiles.full_name}` : ''}</span>
              </div>
              {e.note && <div>{e.note}</div>}
              {e.photo_url && <a href={e.photo_url} target="_blank" rel="noreferrer"><img className="damage-thumb" src={e.photo_url} alt="Damage photo" loading="lazy" /></a>}
            </li>
          ))}
        </ul>
      )}
      {item.notes && events?.length === 0 && <p className="small muted pre">{item.notes}</p>}
    </section>
  )
}
