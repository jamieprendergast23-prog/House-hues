import { useState } from 'react'
import { today } from '../lib/format'

const SERVICES = [
  ['staging', 'Property staging', 'Furnish and style a property for sale or lease'],
  ['consult', 'Styling consult', 'An on-site visit with advice to style with what you have'],
  ['design', 'Interior design', 'Tailored design for your own home'],
]

export default function Book() {
  const [f, setF] = useState({
    name: '', email: '', phone: '', agency: '', service_type: 'staging', property_address: '', suburb: '',
    preferred_date: '', property_type: 'House', bedrooms: '', occupied: '', message: '', website: '',
  })
  const [state, setState] = useState('form') // form | sending | done | error
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setState('sending'); setErr('')
    try {
      const res = await fetch('/.netlify/functions/booking-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(out.error || 'Something went wrong')
      setState('done')
    } catch (e2) { setErr(e2.message); setState('error') }
  }

  if (state === 'done') {
    return (
      <div className="center-page public">
        <div className="card">
          <h1 className="brand brand-lg">House & Hues</h1>
          <h2>Thanks {f.name.split(' ')[0]}!</h2>
          <p>Your request for {f.property_address} has come through. I’ll be in touch shortly to confirm details and a time.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="public">
      <form className="book" onSubmit={submit}>
        <h1 className="brand brand-lg">House & Hues</h1>
        <p className="muted">Request staging, a consult or design. I’ll come back to you to confirm.</p>

        <fieldset>
          <legend>What do you need?</legend>
          <div className="service-cards">
            {SERVICES.map(([k, t, d]) => (
              <label key={k} className={`service ${f.service_type === k ? 'on' : ''}`}>
                <input type="radio" name="svc" value={k} checked={f.service_type === k} onChange={set('service_type')} />
                <strong>{t}</strong><span>{d}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>The property</legend>
          <label className="field"><span className="field-label">Street address *</span>
            <input required value={f.property_address} onChange={set('property_address')} autoComplete="street-address" /></label>
          <label className="field"><span className="field-label">Suburb / town</span>
            <input value={f.suburb} onChange={set('suburb')} /></label>
          <div className="grid2">
            <label className="field"><span className="field-label">Type</span>
              <select value={f.property_type} onChange={set('property_type')}>
                {['House', 'Unit / apartment', 'Townhouse', 'Acreage', 'Other'].map((t) => <option key={t}>{t}</option>)}
              </select></label>
            <label className="field"><span className="field-label">Bedrooms</span>
              <input type="number" min="0" max="10" inputMode="numeric" value={f.bedrooms} onChange={set('bedrooms')} /></label>
          </div>
          {f.service_type === 'staging' && (
            <label className="field"><span className="field-label">Is it lived in?</span>
              <select value={f.occupied} onChange={set('occupied')}>
                <option value="">Not sure</option><option value="false">Vacant</option><option value="true">Occupied</option>
              </select></label>
          )}
          <label className="field"><span className="field-label">{f.service_type === 'staging' ? 'Ideal install date' : 'Preferred date'}</span>
            <input type="date" min={today()} value={f.preferred_date} onChange={set('preferred_date')} /></label>
        </fieldset>

        <fieldset>
          <legend>You</legend>
          <label className="field"><span className="field-label">Name *</span>
            <input required value={f.name} onChange={set('name')} autoComplete="name" /></label>
          <label className="field"><span className="field-label">Agency (if you’re an agent)</span>
            <input value={f.agency} onChange={set('agency')} autoComplete="organization" /></label>
          <div className="grid2">
            <label className="field"><span className="field-label">Email *</span>
              <input required type="email" value={f.email} onChange={set('email')} autoComplete="email" /></label>
            <label className="field"><span className="field-label">Phone *</span>
              <input required type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" /></label>
          </div>
          <label className="field"><span className="field-label">Anything else?</span>
            <textarea rows={4} value={f.message} onChange={set('message')} placeholder="Listing date, style, rooms to stage, access…" /></label>
          {/* spam trap: real people never see this */}
          <input className="hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} aria-hidden="true" />
        </fieldset>

        {state === 'error' && <p className="warn-text">{err}. Please try again or call me directly.</p>}
        <button className="btn btn-primary btn-block btn-big" disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Send request'}
        </button>
      </form>
    </div>
  )
}
