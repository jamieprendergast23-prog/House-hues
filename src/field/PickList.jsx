import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, friendlyError } from '../lib/supabase'
import { fmtDate, hireEnd } from '../lib/format'
import { toast } from '../lib/toast'
import { Loading, Empty } from '../components/ui'
import Scanner from '../components/Scanner'

export default function PickList() {
  const { jobId } = useParams()
  const [job, setJob] = useState(null)
  const [lines, setLines] = useState([])
  const [mode, setMode] = useState(null) // pack | return
  const [sort, setSort] = useState('room') // room | shed
  const [scan, setScan] = useState(false)
  const [last, setLast] = useState(null)

  const load = useCallback(async () => {
    const [j, l] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', jobId).single(),
      supabase.from('job_items')
        .select('id, room, packed_at, returned_at, items(id, code, name, category, colour, photo_url, shed_location)')
        .eq('job_id', jobId),
    ])
    setJob(j.data)
    setLines(l.data || [])
    // sensible default: once things are out, you're bringing them back
    setMode((m) => m || (['installed', 'collected'].includes(j.data?.status) ? 'return' : 'pack'))
  }, [jobId])
  useEffect(() => { load() }, [load])

  if (!job || !mode) return <Loading />

  const visible = mode === 'pack' ? lines : lines.filter((l) => l.packed_at)
  const doneOf = (l) => (mode === 'pack' ? !!l.packed_at : !!l.returned_at)
  const done = visible.filter(doneOf).length

  const groups = visible.reduce((acc, l) => {
    const key = sort === 'room' ? l.room : (l.items.shed_location || 'No shed spot')
    ;(acc[key] ||= []).push(l)
    return acc
  }, {})
  const groupKeys = Object.keys(groups).sort()

  const toggle = async (l) => {
    const state = mode === 'pack' ? (l.packed_at ? 'unpacked' : 'packed') : (l.returned_at ? 'unreturned' : 'returned')
    if (state === 'unpacked' && l.returned_at) return
    navigator.vibrate?.(30)
    // optimistic so it feels instant on site
    const now = new Date().toISOString()
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
      : await supabase.rpc('scan_return', { p_code: code })
    if (error) { setLast({ ok: false, text: friendlyError(error) }); return }
    const r = data.result
    const msg = {
      packed: [true, `✓ ${data.name} → ${data.room}`],
      already: [true, `${data.name} already packed`],
      returned: [true, `✓ ${data.name} back in shed`],
      not_on_list: [false, `✕ ${data.name} is NOT on this job. Leave it.`],
      not_out: [false, `${data.name} wasn’t marked as out`],
      unknown_code: [false, `✕ Code ${code} not found`],
    }[r] || [false, r]
    if (!msg[0]) navigator.vibrate?.([80, 60, 80])
    setLast({ ok: msg[0], text: msg[1] })
    load()
  }

  const end = hireEnd(job)

  return (
    <div className="stack">
      <div>
        <h1 className="field-title">{job.property_address}</h1>
        <p className="muted">
          {job.pack_date && <>Pack {fmtDate(job.pack_date)} · </>}
          {job.install_date && <>Install {fmtDate(job.install_date)} · </>}
          {(job.collection_date || end) && <>Collect {fmtDate(job.collection_date || end)}</>}
        </p>
        {job.access_notes && <div className="access">🔑 {job.access_notes}</div>}
      </div>

      <div className="seg seg-big">
        <button className={mode === 'pack' ? 'on' : ''} onClick={() => setMode('pack')}>Packing</button>
        <button className={mode === 'return' ? 'on' : ''} onClick={() => setMode('return')}>Bringing back</button>
      </div>

      <div className="progress-head">
        <div className="progress progress-big"><i style={{ width: `${visible.length ? (done / visible.length) * 100 : 0}%` }} /></div>
        <strong>{done} / {visible.length}</strong> {mode === 'pack' ? 'packed' : 'back in shed'}
        {visible.length > 0 && done === visible.length && <div className="all-done">All done ✓</div>}
      </div>

      <div className="row">
        <span className="small muted">Group by</span>
        <div className="seg">
          <button className={sort === 'room' ? 'on' : ''} onClick={() => setSort('room')}>Room</button>
          <button className={sort === 'shed' ? 'on' : ''} onClick={() => setSort('shed')}>Shed spot</button>
        </div>
      </div>

      {visible.length === 0 && <Empty>{mode === 'pack' ? 'Nothing on this pick list yet.' : 'Nothing has been packed out yet.'}</Empty>}

      {groupKeys.map((k) => (
        <section key={k}>
          <h2 className="field-h">{k} <span className="muted">{groups[k].filter(doneOf).length}/{groups[k].length}</span></h2>
          {groups[k].sort((a, b) => doneOf(a) - doneOf(b)).map((l) => (
            <button key={l.id} className={`pick ${doneOf(l) ? 'done' : ''}`} onClick={() => toggle(l)}>
              {l.items.photo_url ? <img src={l.items.photo_url} alt="" /> : <span className="pick-noimg" />}
              <span className="pick-text">
                <strong>{l.items.name}</strong>
                <span>{l.items.code}{l.items.colour ? ` · ${l.items.colour}` : ''}</span>
                <span>{sort === 'room' ? `Shed: ${l.items.shed_location || '—'}` : `Room: ${l.room}`}</span>
              </span>
              <span className="pick-check">{doneOf(l) ? '✓' : ''}</span>
            </button>
          ))}
        </section>
      ))}

      <div className="field-spacer" />
      <button className="fab" onClick={() => { setLast(null); setScan(true) }}>Scan to {mode === 'pack' ? 'pack' : 'return'}</button>

      {scan && (
        <Scanner continuous title={mode === 'pack' ? 'Scan items as you load' : 'Scan items as they come off'}
          onClose={() => setScan(false)} onCode={onScan}>
          {last && <div className={`scan-result ${last.ok ? 'ok' : 'bad'}`}>{last.text}</div>}
          <div className="scan-count">{done} / {visible.length}</div>
        </Scanner>
      )}
    </div>
  )
}
