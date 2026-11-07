import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { supabase, friendlyError } from '../lib/supabase'
import { PIPELINES, TYPE_LABEL } from '../lib/constants'
import { fmtDate, fmtLong, hireEnd, money, addDays } from '../lib/format'
import { toast } from '../lib/toast'
import { ERP, PLANNER } from '../lib/features'
import HireCard from '../components/HireCard'
import StockPicker from '../components/StockPicker'
import JobRooms from '../components/JobRooms'
import { Field, Modal, Loading, TypeTag, JobPill } from '../components/ui'

const BLANK_JOB = {
  type: 'staging', status: ERP ? 'enquiry' : 'booked', property_address: '', suburb: '', access_notes: '', notes: '',
  client_id: null, site_visit_date: null, consult_date: null, pack_date: null, install_date: null,
  hire_weeks: 6, hire_end_date: null, collection_date: null, unpack_date: null,
}

// Mirror of jobs.hold_period in the database
function holdRange(j) {
  const start = j.pack_date || j.install_date
  if (!start) return null
  let end = j.unpack_date || j.collection_date || j.hire_end_date ||
    (j.install_date ? addDays(j.install_date, j.hire_weeks * 7) : addDays(j.pack_date, j.hire_weeks * 7))
  if (end < start) end = start
  return `[${start},${end}]`
}

export default function JobDetail() {
  const { id } = useParams()
  const isNew = id === 'new'
  const nav = useNavigate()
  const loc = useLocation()

  const [job, setJob] = useState(isNew ? { ...BLANK_JOB, ...(loc.state?.prefill || {}) } : null)
  const [saved, setSaved] = useState(null)       // last saved copy, to detect date changes
  const [fin, setFin] = useState({})
  const [clients, setClients] = useState([])
  const [newClient, setNewClient] = useState(isNew ? loc.state?.newClient || null : null)
  const [lines, setLines] = useState([])
  const [busy, setBusy] = useState(false)
  const [conflicts, setConflicts] = useState(null)
  const [adding, setAdding] = useState(false)

  const loadLines = useCallback(async () => {
    if (isNew) return
    const { data } = await supabase.from('job_items')
      .select('id, room, packed_at, returned_at, items(id, code, sku, name, category, photo_url, shed_location)')
      .eq('job_id', id).order('room')
    setLines(data || [])
  }, [id, isNew])

  useEffect(() => {
    supabase.from('clients').select('id, name, agency, email, phone').order('name').then(({ data }) => setClients(data || []))
    if (isNew) return
    supabase.from('jobs').select('*').eq('id', id).single().then(({ data }) => { setJob(data); setSaved(data) })
    supabase.from('job_finance').select('*').eq('job_id', id).maybeSingle().then(({ data }) => setFin(data || {}))
    loadLines()
  }, [id, isNew, loadLines])

  const client = useMemo(() => clients.find((c) => c.id === job?.client_id), [clients, job?.client_id])

  if (!job) return <Loading />

  const set = (k) => (e) => setJob({ ...job, [k]: e.target.value === '' ? null : e.target.value })
  const setF = (k) => (e) => setFin({ ...fin, [k]: e.target.value === '' ? null : e.target.value })
  const pipeline = ERP ? PIPELINES[job.type] : PIPELINES.simple

  const save = async (e) => {
    e?.preventDefault()
    setBusy(true)
    try {
      // 1. check that moving dates won't double-book anything already on this job
      if (!isNew && lines.length) {
        const range = holdRange(job)
        if (range && range !== holdRange(saved)) {
          const { data: c } = await supabase.rpc('job_date_conflicts', { p_job_id: id, p_range: range })
          if (c?.length) { setConflicts(c); setBusy(false); return }
        }
      }
      // 2. client
      let client_id = job.client_id
      if (newClient?.name) {
        const { data, error } = await supabase.from('clients').insert(newClient).select().single()
        if (error) throw error
        client_id = data.id
        setClients([...clients, data]); setNewClient(null)
      }
      const { id: _id, job_number: _n, hold_period: _h, created_at: _c, updated_at: _u, ...fields } = job
      const row = { ...fields, client_id, hire_weeks: Number(job.hire_weeks) || 6 }
      // 3. job
      let jobId = id
      if (isNew) {
        const { data, error } = await supabase.from('jobs').insert(row).select().single()
        if (error) throw error
        jobId = data.id
        if (loc.state?.requestId) {
          await supabase.from('booking_requests').update({ status: 'converted', job_id: jobId }).eq('id', loc.state.requestId)
        }
      } else {
        const { data, error } = await supabase.from('jobs').update(row).eq('id', id).select().single()
        if (error) throw error
        setJob(data); setSaved(data)
      }
      // 4. money
      const { job_id: _j, ...f } = fin
      if (Object.keys(f).length) {
        await supabase.from('job_finance').upsert({ job_id: jobId, ...f })
      }
      toast('Saved')
      if (isNew) nav(`/jobs/${jobId}`, { replace: true })
    } catch (err) { toast(friendlyError(err), 'error') }
    setBusy(false)
  }

  const setStatus = async (status) => {
    if (isNew) { setJob({ ...job, status }); return }
    if (status === 'cancelled' && !confirm('Cancel this job? Items not yet packed will be released.')) return
    const { data, error } = await supabase.from('jobs').update({ status }).eq('id', id).select().single()
    if (error) return toast(friendlyError(error), 'error')
    setJob({ ...job, status: data.status }); toast(`Marked ${status.replace('_', ' ')}`)
    if (status === 'cancelled') loadLines()
  }

  const removeLine = async (lineId) => {
    const { error } = await supabase.from('job_items').delete().eq('id', lineId)
    if (error) return toast(friendlyError(error), 'error')
    setLines(lines.filter((l) => l.id !== lineId))
  }

  const deleteJob = async () => {
    if (lines.some((l) => l.packed_at && !l.returned_at)) return toast('Items are still out on this job. Return them first.', 'error')
    if (!confirm('Delete this job completely?')) return
    await supabase.from('job_items').delete().eq('job_id', id)
    const { error } = await supabase.from('jobs').delete().eq('id', id)
    if (error) return toast(friendlyError(error), 'error')
    nav('/jobs', { replace: true })
  }

  const end = hireEnd(job)
  const balance = fin.quote_amount ? Number(fin.quote_amount) - (fin.paid_in_full_on ? Number(fin.quote_amount) : fin.deposit_paid_on ? Number(fin.deposit_amount || 0) : 0) : null
  const packedCount = lines.filter((l) => l.packed_at).length

  return (
    <div className="stack">
    <form onSubmit={save} className="stack">
      <div className="page-head">
        <div>
          <h1>{isNew ? (ERP ? 'New job' : 'New job: where is stock going?') : job.property_address}</h1>
          {!isNew && <div className="row-pills"><span className="muted">#{job.job_number}</span>{ERP && <TypeTag type={job.type} />}<JobPill job={job} /></div>}
        </div>
      </div>

      {/* pipeline */}
      <div className="stepper">
        {pipeline.map(([k, l], i) => {
          const idx = pipeline.findIndex(([s]) => s === job.status)
          return (
            <button type="button" key={k} onClick={() => setStatus(k)}
              className={`step ${k === job.status ? 'current' : i < idx ? 'done' : ''}`}>
              <span className="step-dot">{i < idx ? '✓' : i + 1}</span>{l}
            </button>
          )
        })}
      </div>

      <section className="card">
        <h2>Property</h2>
        {isNew && ERP && (
          <Field label="Service">
            <div className="seg">
              {Object.entries(TYPE_LABEL).map(([k, l]) => (
                <button type="button" key={k} className={job.type === k ? 'on' : ''} onClick={() => setJob({ ...job, type: k, status: 'enquiry' })}>{l}</button>
              ))}
            </div>
          </Field>
        )}
        <Field label="Address"><input required value={job.property_address || ''} onChange={set('property_address')} placeholder="12 Banna Ave" /></Field>
        <Field label="Suburb / town"><input value={job.suburb || ''} onChange={set('suburb')} /></Field>
        <Field label="Access notes" hint="Crew can see this. Lockbox, parking, stairs, who to call.">
          <textarea rows={2} value={job.access_notes || ''} onChange={set('access_notes')} />
        </Field>
      </section>

      {(ERP || PLANNER) && <section className="card">
        <h2>Client</h2>
        {newClient ? (
          <div className="grid2">
            <Field label="Name"><input value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} /></Field>
            <Field label="Agency"><input value={newClient.agency} onChange={(e) => setNewClient({ ...newClient, agency: e.target.value })} /></Field>
            <Field label="Email"><input type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} /></Field>
            <Field label="Phone"><input type="tel" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} /></Field>
            <button type="button" className="btn btn-ghost" onClick={() => setNewClient(null)}>Pick existing instead</button>
          </div>
        ) : (
          <>
            <select value={job.client_id || ''} onChange={set('client_id')}>
              <option value="">— Choose client —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.agency ? ` (${c.agency})` : ''}</option>)}
            </select>
            {client && (
              <p className="small">
                {client.phone && <><a href={`tel:${client.phone}`}>{client.phone}</a> · </>}
                {client.email && <a href={`mailto:${client.email}`}>{client.email}</a>}
              </p>
            )}
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setNewClient({ name: '', agency: '', email: '', phone: '', kind: 'agent' })}>+ New client</button>
          </>
        )}
      </section>}

      <section className="card">
        <h2>Dates</h2>
        {job.type === 'consult' ? (
          <Field label="Consult day"><input type="date" value={job.consult_date || ''} onChange={set('consult_date')} /></Field>
        ) : (
          <div className="grid2">
            {ERP && <Field label="Site visit"><input type="date" value={job.site_visit_date || ''} onChange={set('site_visit_date')} /></Field>}
            {job.type === 'staging' && <>
              <Field label="Packing day"><input type="date" value={job.pack_date || ''} onChange={set('pack_date')} /></Field>
              <Field label="Install day"><input type="date" value={job.install_date || ''} onChange={set('install_date')} /></Field>
              <Field label="Hire (weeks)"><input type="number" min="1" max="52" inputMode="numeric" value={job.hire_weeks} onChange={set('hire_weeks')} /></Field>
              <Field label="Hire finish" hint={job.hire_end_date ? 'Set by hand (extended)' : job.install_date ? `Auto: ${fmtDate(hireEnd({ ...job, hire_end_date: null }))}. Change if extended.` : 'Install day + hire weeks'}>
                <input type="date" value={job.hire_end_date || ''} onChange={set('hire_end_date')} />
              </Field>
              <Field label="Collection day" hint={end ? `Hire ends ${fmtDate(end)}` : ''}>
                <input type="date" value={job.collection_date || ''} onChange={set('collection_date')} />
              </Field>
              <Field label="Unpack day"><input type="date" value={job.unpack_date || ''} onChange={set('unpack_date')} /></Field>
            </>}
          </div>
        )}
        {job.type === 'staging' && job.install_date && !job.collection_date && (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setJob({ ...job, collection_date: end })}>
            Set collection to end of hire ({fmtDate(end)})
          </button>
        )}
      </section>

      {PLANNER && job.type === 'staging' && !isNew && (
        <section className="card">
          <h2>Sale results <span className="muted small">for your results sheet</span></h2>
          <div className="grid2">
            <Field label="Listing agent"><input value={job.agent_name || ''} onChange={set('agent_name')} placeholder="e.g. Tom, Riverina Realty" /></Field>
            <Field label="Listed (first open / online)"><input type="date" value={job.listed_date || ''} onChange={set('listed_date')} /></Field>
            <Field label="Sold (unconditional)"><input type="date" value={job.sold_date || ''} onChange={set('sold_date')} /></Field>
            <Field label="Price guide ($)"><input type="number" inputMode="numeric" value={job.guide_price ?? ''} onChange={set('guide_price')} placeholder="650000" /></Field>
            <Field label="Sale price ($)"><input type="number" inputMode="numeric" value={job.sale_price ?? ''} onChange={set('sale_price')} /></Field>
          </div>
          <ResultLine job={job} />
        </section>
      )}

      {!ERP && PLANNER && (
        <section className="card">
          <h2>Payment</h2>
          <div className="seg seg-big">
            {[['none', 'Not paid'], ['deposit', 'Deposit paid'], ['full', 'Paid in full']].map(([k, l]) => {
              const cur = fin.paid_in_full_on ? 'full' : fin.deposit_paid_on ? 'deposit' : 'none'
              return (
                <button type="button" key={k} className={cur === k ? 'on' : ''} onClick={() => setFin({
                  ...fin,
                  deposit_paid_on: k === 'none' ? null : fin.deposit_paid_on || new Date().toISOString().slice(0, 10),
                  paid_in_full_on: k === 'full' ? fin.paid_in_full_on || new Date().toISOString().slice(0, 10) : null,
                })}>{l}</button>
              )
            })}
          </div>
          <p className="small muted">Save changes to keep it.</p>
        </section>
      )}

      {ERP && <section className="card">
        <h2>Money <span className="muted small">only you see this</span></h2>
        <div className="grid2">
          <Field label="Quote ($)"><input type="number" step="0.01" inputMode="decimal" value={fin.quote_amount ?? ''} onChange={setF('quote_amount')} /></Field>
          <Field label="Deposit ($)"><input type="number" step="0.01" inputMode="decimal" value={fin.deposit_amount ?? ''} onChange={setF('deposit_amount')} /></Field>
          <Field label="Deposit paid on"><input type="date" value={fin.deposit_paid_on || ''} onChange={setF('deposit_paid_on')} /></Field>
          <Field label="Paid in full on"><input type="date" value={fin.paid_in_full_on || ''} onChange={setF('paid_in_full_on')} /></Field>
          <Field label="Invoice #"><input value={fin.invoice_ref || ''} onChange={setF('invoice_ref')} /></Field>
        </div>
        {balance !== null && <p className={balance > 0 ? 'warn-text' : 'ok-text'}>{balance > 0 ? `Balance owing ${money(balance)}` : 'Paid in full'}</p>}
      </section>}

      <section className="card">
        <h2>Notes</h2>
        <textarea rows={3} value={job.notes || ''} onChange={set('notes')} placeholder="Style, colour palette, things to remember…" />
      </section>

      <div className="sticky-actions row">
        <button className="btn btn-primary grow btn-big" disabled={busy}>{isNew ? 'Create job' : 'Save changes'}</button>
      </div>
    </form>

      {!isNew && job.type === 'staging' && (
        <JobRooms jobId={id} lines={lines} packedCount={packedCount}
          canAddFurniture={Boolean(saved?.pack_date || saved?.install_date)}
          onAddFurniture={(room) => setAdding(room)}
          onRemoveLine={removeLine}
          onOpenPickList={() => nav(`/pick/${id}`)}
          onLinesChanged={loadLines} />
      )}

      {!isNew && ERP && <ClientMessage job={job} client={client} />}
      {!isNew && PLANNER && job.type === 'staging' && job.install_date && <HireCard job={job} client={client} fin={fin} />}

      {!isNew && (
        <div className="row">
          {job.status !== 'cancelled' && <button type="button" className="btn btn-ghost" onClick={() => setStatus('cancelled')}>Cancel job</button>}
          <button type="button" className="btn btn-ghost danger" onClick={deleteJob}>Delete job</button>
        </div>
      )}

      {adding && <StockPicker jobId={id} initialRoom={typeof adding === 'string' ? adding : undefined} onClose={() => { setAdding(false); loadLines() }} />}

      {conflicts && (
        <Modal title="Those dates clash" onClose={() => setConflicts(null)}>
          <p>These items are already booked on another job for the new dates:</p>
          <ul className="list">
            {conflicts.map((c, i) => (
              <li key={i} className="list-row"><div className="grow">
                <div className="row-title">{c.item_name} <span className="muted">{c.item_code}</span></div>
                <div className="row-sub">Job #{c.other_job} · {c.other_address}</div>
              </div></li>
            ))}
          </ul>
          <p className="small muted">Remove them from this job (or the other one) first, then change the dates.</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => setConflicts(null)}>OK</button>
        </Modal>
      )}
    </div>
  )
}

/** The “here are your dates” message she sends after install */
function ClientMessage({ job, client }) {
  if (job.type !== 'staging' || !job.install_date) return null
  const first = client?.name?.split(' ')[0] || 'there'
  const end = hireEnd(job)
  const body =
`Hi ${first},

Your staging at ${job.property_address} is all installed. Here are your key dates:

Installed: ${fmtLong(job.install_date)}
Hire period: ${job.hire_weeks} weeks
Hire ends: ${fmtLong(end)}
${job.collection_date ? `Collection: ${fmtLong(job.collection_date)}\n` : ''}
If the property sells sooner or you'd like to extend, just let me know.

Thanks so much,
House & Hues`
  const subject = `Your staging dates – ${job.property_address}`
  return (
    <section className="card">
      <h2>Send dates to client</h2>
      <pre className="message">{body}</pre>
      <div className="row">
        <a className="btn btn-primary" href={`mailto:${client?.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>Open in email</a>
        <button type="button" className="btn" onClick={() => { navigator.clipboard.writeText(body); toast('Copied') }}>Copy</button>
      </div>
    </section>
  )
}

function ResultLine({ job }) {
  const start = job.listed_date || job.install_date
  const dom = start && job.sold_date ? Math.round((new Date(job.sold_date) - new Date(start)) / 86400000) : null
  const pct = job.guide_price && job.sale_price ? ((job.sale_price - job.guide_price) / job.guide_price) * 100 : null
  if (dom === null && pct === null) return <p className="small muted">Fill in the sold date and prices once it sells. They go into the Results page you can show agents.</p>
  return (
    <div className="result-line">
      {dom !== null && <span><b>{dom}</b> days on market</span>}
      {pct !== null && <span className={pct >= 0 ? 'ok-text' : 'warn-text'}><b>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</b> vs guide</span>}
    </div>
  )
}
