import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, friendlyError } from '../lib/supabase'
import { fmtDate, hireEnd } from '../lib/format'
import { toast } from '../lib/toast'
import { Loading, Empty, Modal } from '../components/ui'
import Scanner from '../components/Scanner'
import PhotoViewer from '../components/PhotoViewer'
import { installStep } from '../lib/installOrder'

// pack   = at the shed, loading for install
// load   = at the house on pack-up day, loading the truck (the pack-up check)
// return = back at the shed, unpacking
const MODES = {
  pack: { tab: 'Packing', done: 'packed', scan: 'Scan to pack', scanTitle: 'Scan items as you load' },
  load: { tab: 'Pack up', done: 'on the truck', scan: 'Scan onto truck', scanTitle: 'Scan each piece as it goes on the truck' },
  return: { tab: 'Unpack', done: 'back in shed', scan: 'Scan to unpack', scanTitle: 'Scan items as they come off' },
}

export default function PickList() {
  const { jobId } = useParams()
  const [job, setJob] = useState(null)
  const [lines, setLines] = useState([])
  const [mode, setMode] = useState(null)
  const [sort, setSort] = useState('install') // install | room | shed
  const [scan, setScan] = useState(false)
  const [last, setLast] = useState(null)
  const [photos, setPhotos] = useState([])
  const [viewer, setViewer] = useState(null)
  const [finishing, setFinishing] = useState(false)
  const [missingNote, setMissingNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [j, l, ph] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', jobId).single(),
      supabase.from('job_items')
        .select('id, room, packed_at, loaded_at, missing_at, returned_at, items(id, code, sku, name, category, subcategory, colour, photo_url, shed_location)')
        .eq('job_id', jobId),
      supabase.from('job_photos').select('*').eq('job_id', jobId).order('created_at'),
    ])
    setJob(j.data)
    setLines(l.data || [])
    setPhotos(ph.data || [])
    // sensible default for where they are in the job
    setMode((m) => m || (j.data?.status === 'installed' ? 'load' : ['collected', 'complete'].includes(j.data?.status) ? 'return' : 'pack'))
  }, [jobId])
  useEffect(() => { load() }, [load])

  if (!job || !mode) return <Loading />

  const visible = mode === 'pack' ? lines
    : mode === 'load' ? lines.filter((l) => l.packed_at && (!l.returned_at || l.loaded_at))
      : lines.filter((l) => l.packed_at)
  const doneOf = (l) => (mode === 'pack' ? !!l.packed_at : mode === 'load' ? !!l.loaded_at || !!l.returned_at : !!l.returned_at)
  const done = visible.filter(doneOf).length
  const notLoaded = mode === 'load' ? visible.filter((l) => !doneOf(l)) : []

  const keyOf = (l) => {
    if (sort === 'room') return l.room
    if (sort === 'shed') return l.items.shed_location || 'No shed spot'
    const s = installStep(l.items)
    return `${s.n}. ${s.label}`
  }
  const groups = visible.reduce((acc, l) => { (acc[keyOf(l)] ||= []).push(l); return acc }, {})
  // rooms with a design but nothing on the list yet still show, so crew can see the look
  if (sort === 'room' && mode === 'pack') for (const p of photos) if (p.kind === 'design' && !groups[p.room]) groups[p.room] = []
  const groupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const designs = (room) => photos.filter((p) => p.room === room && p.kind === 'design')
  const sitePhotos = (room) => photos.filter((p) => p.room === room && p.kind === 'site')

  const toggle = async (l) => {
    navigator.vibrate?.(30)
    const now = new Date().toISOString()
    if (mode === 'load') {
      if (l.returned_at) return
      const on = !l.loaded_at
      setLines((ls) => ls.map((x) => (x.id !== l.id ? x : { ...x, loaded_at: on ? now : null, missing_at: on ? null : x.missing_at })))
      const { error } = await supabase.rpc('set_loaded', { p_job_item_id: l.id, p_loaded: on })
      if (error) { toast(friendlyError(error), 'error'); load() }
      return
    }
    const state = mode === 'pack' ? (l.packed_at ? 'unpacked' : 'packed') : (l.returned_at ? 'unreturned' : 'returned')
    if (state === 'unpacked' && l.returned_at) return
    // optimistic so it feels instant on site
    setLines((ls) => ls.map((x) => x.id !== l.id ? x : {
      ...x,
      packed_at: state === 'packed' ? now : state === 'unpacked' ? null : x.packed_at,
      returned_at: state === 'returned' ? now : state === 'unreturned' ? null : x.returned_at,
    }))
    const { error } = await supabase.rpc('set_job_item_state', { p_job_item_id: l.id, p_state: state })
    if (error) { toast(friendlyError(error), 'error'); load() }
  }

  const onScan = async (code) => {
    const { data, error } = mode === 'pack'
      ? await supabase.rpc('scan_pack', { p_job_id: jobId, p_code: code })
      : mode === 'load'
        ? await supabase.rpc('scan_load', { p_job_id: jobId, p_code: code })
        : await supabase.rpc('scan_return', { p_code: code })
    if (error) { setLast({ ok: false, text: friendlyError(error) }); return }
    const r = data.result
    const label = data.sku ? `${data.sku} ${data.name}` : data.name
    const msg = {
      packed: [true, `✓ ${label} → ${data.room}`],
      loaded: [true, `✓ ${label} on the truck (${data.room})`],
      already: [true, `${label} already ticked`],
      returned: [true, `✓ ${label} back in shed`],
      not_on_list: [false, `✕ ${label} is NOT on this job. Leave it.`],
      not_from_here: [false, `✕ ${label} isn’t from this house${data.other ? `. It should be at ${data.other}` : ''}.`],
      not_out: [false, `${label} wasn’t marked as out`],
      unknown_code: [false, `✕ Code ${code} not found`],
    }[r] || [false, r]
    if (!msg[0]) navigator.vibrate?.([80, 60, 80])
    setLast({ ok: msg[0], text: msg[1] })
    load()
  }

  const finish = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('finish_pack_up', { p_job_id: jobId, p_note: missingNote })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    setFinishing(false); setMissingNote('')
    toast(data.missing ? `Pack up done. ${data.missing} marked missing and flagged to Hayley.` : `Pack up done, all ${done} pieces on the truck ✓`)
    await load()
    setMode('return')
  }

  const end = hireEnd(job)
  const cfg = MODES[mode]

  return (
    <div className="stack">
      <div>
        <h1 className="field-title">{job.property_address}</h1>
        <p className="muted">
          {job.pack_date && <>Pack {fmtDate(job.pack_date)} · </>}
          {job.install_date && <>Install {fmtDate(job.install_date)} · </>}
          {(job.collection_date || end) && <>Pack up {fmtDate(job.collection_date || end)}</>}
        </p>
        {job.access_notes && <div className="access">🔑 {job.access_notes}</div>}
      </div>

      <div className="seg seg-big">
        {Object.entries(MODES).map(([k, m]) => (
          <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{m.tab}</button>
        ))}
      </div>

      {mode === 'load' && (
        <p className="note small">At the house: scan or tick every piece as it goes on the truck. Tap <strong>Finish pack up</strong> before you leave and the app shows anything still missing.</p>
      )}

      <div className="progress-head">
        <div className="progress progress-big"><i style={{ width: `${visible.length ? (done / visible.length) * 100 : 0}%` }} /></div>
        <strong>{done} / {visible.length}</strong> {cfg.done}
        {visible.length > 0 && done === visible.length && <div className="all-done">All done ✓</div>}
      </div>

      <div className="row">
        <span className="small muted">Group by</span>
        <div className="seg">
          <button className={sort === 'install' ? 'on' : ''} onClick={() => setSort('install')}>Install order</button>
          <button className={sort === 'room' ? 'on' : ''} onClick={() => setSort('room')}>Room</button>
          <button className={sort === 'shed' ? 'on' : ''} onClick={() => setSort('shed')}>Shed spot</button>
        </div>
      </div>
      {sort === 'install' && mode === 'pack' && (
        <p className="small muted">Load the truck in reverse (décor and art first, rugs last) so rugs come off first at the house.</p>
      )}

      {visible.length === 0 && <Empty>{mode === 'pack' ? 'Nothing on this pick list yet.' : 'Nothing has been packed out to this house yet.'}</Empty>}

      {groupKeys.map((k) => (
        <section key={k}>
          <h2 className="field-h">{k} <span className="muted">{groups[k].filter(doneOf).length}/{groups[k].length}</span></h2>
          {sort === 'room' && designs(k).length > 0 && (
            <div className="pick-designs">
              {designs(k).map((p, i, arr) => (
                <button key={p.id} className="pick-design" onClick={() => setViewer({ photos: arr.map((x) => ({ url: x.url, label: `${k} · design` })), start: i })}>
                  <img src={p.url} alt={`${k} design`} loading="lazy" />
                </button>
              ))}
            </div>
          )}
          {sort === 'room' && mode !== 'return' && sitePhotos(k).length > 0 && (
            <button className="btn btn-small btn-ghost" onClick={() => setViewer({ photos: sitePhotos(k).map((x) => ({ url: x.url, label: `${k} · site photo` })), start: 0 })}>
              See {sitePhotos(k).length} site photo{sitePhotos(k).length > 1 ? 's' : ''} of the empty room
            </button>
          )}
          {groups[k].sort((a, b) => doneOf(a) - doneOf(b)).map((l) => (
            <button key={l.id} className={`pick ${doneOf(l) ? 'done' : ''} ${l.missing_at && !doneOf(l) ? 'missing' : ''}`} onClick={() => toggle(l)}>
              {l.items.photo_url ? <img src={l.items.photo_url} alt="" /> : <span className="pick-noimg" />}
              <span className="pick-text">
                <strong>{l.items.name}</strong>
                <span>{l.items.sku ? `${l.items.sku} · ` : ''}{l.items.code}{l.items.colour ? ` · ${l.items.colour}` : ''}</span>
                <span>{l.missing_at && !l.returned_at ? <b className="warn-text">Marked missing</b> : sort === 'room' ? `Shed: ${l.items.shed_location || '—'}` : sort === 'install' ? `${l.room} · Shed: ${l.items.shed_location || '—'}` : `Room: ${l.room}`}</span>
              </span>
              <span className="pick-check">{doneOf(l) ? '✓' : ''}</span>
            </button>
          ))}
        </section>
      ))}

      <div className="field-spacer" />
      {mode === 'load' && visible.length > 0 && <div className="field-spacer" />}
      <div className="fab-stack">
        {mode === 'load' && visible.length > 0 && (
          <button className="fab fab-finish" onClick={() => setFinishing(true)}>
            Finish pack up{notLoaded.length ? ` (${notLoaded.length} not loaded)` : ' ✓'}
          </button>
        )}
        <button className="fab" onClick={() => { setLast(null); setScan(true) }}>{cfg.scan}</button>
      </div>

      {finishing && (
        <Modal title={notLoaded.length ? `${notLoaded.length} not on the truck` : 'Everything’s on the truck'} onClose={() => setFinishing(false)}>
          {notLoaded.length === 0 ? (
            <div className="stack">
              <p>All {done} pieces from {job.property_address} are loaded. 👍</p>
              <button className="btn btn-primary btn-big btn-block" disabled={busy} onClick={finish}>Finish pack up</button>
            </div>
          ) : (
            <div className="stack">
              <p className="small">Check the house for these before you leave:</p>
              <ul className="list">
                {notLoaded.map((l) => (
                  <li key={l.id} className="list-row">
                    {l.items.photo_url ? <img className="thumb" src={l.items.photo_url} width={56} height={56} alt="" /> : <span className="thumb thumb-empty" style={{ width: 56, height: 56 }} />}
                    <div className="grow">
                      <div className="row-title">{l.items.name}</div>
                      <div className="row-sub">{[l.items.sku, l.items.code].filter(Boolean).join(' · ')} · {l.room}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <button className="btn btn-primary btn-big btn-block" onClick={() => setFinishing(false)}>Go back and look</button>
              <label className="field"><span className="field-label">Can’t find them? Add a note (optional)</span>
                <input value={missingNote} onChange={(e) => setMissingNote(e.target.value)} placeholder="e.g. Agent says vendor kept the lamp" /></label>
              <button className="btn btn-big btn-block danger" disabled={busy} onClick={finish}>
                Mark {notLoaded.length} missing &amp; finish
              </button>
            </div>
          )}
        </Modal>
      )}

      {viewer && <PhotoViewer photos={viewer.photos} start={viewer.start} onClose={() => setViewer(null)} />}

      {scan && (
        <Scanner continuous title={cfg.scanTitle} onClose={() => setScan(false)} onCode={onScan}>
          {last && <div className={`scan-result ${last.ok ? 'ok' : 'bad'}`}>{last.text}</div>}
          <div className="scan-count">{done} / {visible.length}</div>
        </Scanner>
      )}
    </div>
  )
}
