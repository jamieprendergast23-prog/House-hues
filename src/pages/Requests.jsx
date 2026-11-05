import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, isDemo } from '../lib/supabase'
import { fmtDate } from '../lib/format'
import { toast } from '../lib/toast'
import { TypeTag, Loading, Empty } from '../components/ui'

export default function Requests() {
  const nav = useNavigate()
  const [rows, setRows] = useState(null)
  const [tab, setTab] = useState('new')

  useEffect(() => {
    supabase.from('booking_requests').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setRows(data || []))
  }, [])

  if (!rows) return <Loading />
  const shown = rows.filter((r) => tab === 'all' || r.status === tab)

  const convert = async (r) => {
    // reuse an existing client with the same email if there is one
    const { data: existing } = await supabase.from('clients').select('id').ilike('email', r.email).limit(1).maybeSingle()
    nav('/jobs/new', {
      state: {
        requestId: r.id,
        prefill: {
          type: r.service_type, property_address: r.property_address, suburb: r.suburb,
          client_id: existing?.id || null,
          consult_date: r.service_type === 'consult' ? r.preferred_date : null,
          notes: [
            r.preferred_date && `Requested date: ${fmtDate(r.preferred_date)}`,
            r.property_type && `Property: ${r.property_type}${r.bedrooms ? `, ${r.bedrooms} bed` : ''}`,
            r.occupied !== null && (r.occupied ? 'Occupied' : 'Vacant'),
            r.message,
          ].filter(Boolean).join('\n'),
        },
        newClient: existing ? null : { name: r.name, agency: r.agency || '', email: r.email, phone: r.phone || '', kind: r.agency ? 'agent' : 'homeowner' },
      },
    })
  }

  const decline = async (r) => {
    await supabase.from('booking_requests').update({ status: 'declined' }).eq('id', r.id)
    setRows(rows.map((x) => (x.id === r.id ? { ...x, status: 'declined' } : x)))
    toast('Marked declined')
  }

  const bookUrl = isDemo ? `${window.location.href.split('#')[0]}#/book` : `${window.location.origin}/book`

  return (
    <div className="stack">
      <div className="page-head"><h1>Booking requests</h1></div>
      <div className="card-soft small">
        Your public booking form: <a href={bookUrl} target="_blank" rel="noreferrer">{bookUrl}</a>{' '}
        <button className="btn btn-small btn-ghost" onClick={() => { navigator.clipboard.writeText(bookUrl); toast('Link copied') }}>Copy link</button>
      </div>
      <div className="chips">
        {[['new', 'New'], ['converted', 'Booked'], ['declined', 'Declined'], ['all', 'All']].map(([k, l]) => (
          <button key={k} className={`chip ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {shown.length === 0 ? <Empty>No requests here.</Empty> : shown.map((r) => (
        <section key={r.id} className="card">
          <div className="row between">
            <h2>{r.property_address}{r.suburb ? `, ${r.suburb}` : ''}</h2>
            <TypeTag type={r.service_type} />
          </div>
          <p className="small muted">Received {fmtDate(r.created_at.slice(0, 10))}</p>
          <dl className="dl">
            <dt>From</dt><dd>{r.name}{r.agency ? `, ${r.agency}` : ''}</dd>
            <dt>Contact</dt><dd>{r.phone && <a href={`tel:${r.phone}`}>{r.phone}</a>} {r.email && <a href={`mailto:${r.email}`}>{r.email}</a>}</dd>
            {r.preferred_date && <><dt>Wants</dt><dd>{fmtDate(r.preferred_date)}</dd></>}
            {r.property_type && <><dt>Property</dt><dd>{r.property_type}{r.bedrooms ? `, ${r.bedrooms} bed` : ''}{r.occupied !== null ? (r.occupied ? ', occupied' : ', vacant') : ''}</dd></>}
          </dl>
          {r.message && <p className="pre">{r.message}</p>}
          {r.status === 'new' && (
            <div className="row">
              <button className="btn btn-primary" onClick={() => convert(r)}>Create job</button>
              <button className="btn btn-ghost" onClick={() => decline(r)}>Decline</button>
            </div>
          )}
          {r.job_id && <button className="btn btn-small" onClick={() => nav(`/jobs/${r.job_id}`)}>Open job</button>}
        </section>
      ))}
    </div>
  )
}
