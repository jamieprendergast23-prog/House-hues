import { useEffect, useState } from 'react'
import { supabase, isDemo } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { toast } from '../lib/toast'
import { PERMS } from '../lib/constants'
import { Field, Loading } from '../components/ui'
import MailConnect from '../components/MailConnect'
import Icon from '../components/Icon'

/** Tick boxes for the areas a person can use. */
function AccessPicker({ value, onChange, disabled }) {
  const set = new Set(value || [])
  const toggle = (p) => { const n = new Set(set); n.has(p) ? n.delete(p) : n.add(p); onChange(PERMS.map(([k]) => k).filter((k) => n.has(k))) }
  return (
    <div className="perm-grid">
      {PERMS.map(([k, label, hint]) => (
        <label key={k} className={`perm ${set.has(k) ? 'on' : ''}`}>
          <input type="checkbox" checked={set.has(k)} onChange={() => toggle(k)} disabled={disabled} />
          <span><b>{label}</b><small>{hint}</small></span>
        </label>
      ))}
    </div>
  )
}

const summary = (p) => p.role === 'admin' ? 'Everything, including Team'
  : (p.permissions || []).length ? PERMS.filter(([k]) => p.permissions.includes(k)).map(([, l]) => l).join(', ') : 'Nothing yet'

export default function Team() {
  const { session } = useAuth()
  const [people, setPeople] = useState(null)
  const [open, setOpen] = useState(null)
  const [inv, setInv] = useState({ email: '', full_name: '', role: 'crew', permissions: ['field'] })
  const [busy, setBusy] = useState(false)

  const load = () => supabase.from('profiles').select('*').order('created_at').then(({ data }) => setPeople(data || []))
  useEffect(() => { load() }, [])

  const save = async (p, patch) => {
    if (p.id === session.user.id && patch.role && patch.role !== 'admin') return toast('You can’t remove your own admin access', 'error')
    setPeople((ps) => ps.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))
    const { error } = await supabase.from('profiles').update(patch).eq('id', p.id)
    if (error) { toast(error.message, 'error'); load(); return }
    toast('Access updated')
  }

  const invite = async (e) => {
    e.preventDefault()
    if (isDemo) return toast('Invites send real emails once it’s live')
    setBusy(true)
    const res = await fetch('/.netlify/functions/invite-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(inv),
    })
    const out = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return toast(out.error || 'Invite failed', 'error')
    toast(`Invite sent to ${inv.email}`)
    setInv({ email: '', full_name: '', role: 'crew', permissions: ['field'] }); load()
  }

  if (!people) return <Loading />

  return (
    <div className="stack">
      <h1>Team</h1>
      <p className="small muted">Choose what each person can see and do. They only see the parts you tick, and the database blocks the rest.</p>

      <ul className="list team-list">
        {people.map((p) => {
          const me = p.id === session.user.id
          const isOpen = open === p.id
          return (
            <li key={p.id} className="card team-person">
              <button type="button" className="row between team-head" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}>
                <div className="grow">
                  <div className="row-title">{p.full_name || 'Unnamed'}{me ? ' (you)' : ''}</div>
                  <div className="row-sub">{summary(p)}</div>
                </div>
                <span className="muted"><Icon name={isOpen ? 'up' : 'down'} size={18} /></span>
              </button>
              {isOpen && (
                <div className="stack" style={{ marginTop: 10 }}>
                  <div className="seg">
                    <button type="button" className={p.role === 'admin' ? 'on' : ''} onClick={() => p.role !== 'admin' && save(p, { role: 'admin' })}>Admin (everything)</button>
                    <button type="button" className={p.role !== 'admin' ? 'on' : ''} onClick={() => p.role === 'admin' && save(p, { role: 'crew' })} disabled={me}>Choose access</button>
                  </div>
                  {p.role === 'admin'
                    ? <p className="small muted">Admins see everything, including this Team page and email setup.</p>
                    : <AccessPicker value={p.permissions} onChange={(permissions) => save(p, { permissions })} />}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <MailConnect />

      <form className="card stack" onSubmit={invite}>
        <h2>Invite someone</h2>
        <p className="small muted">They’ll get an email with a link to set a password.</p>
        <Field label="Name"><input value={inv.full_name} onChange={(e) => setInv({ ...inv, full_name: e.target.value })} /></Field>
        <Field label="Email"><input required type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
        <div className="seg">
          <button type="button" className={inv.role === 'admin' ? 'on' : ''} onClick={() => setInv({ ...inv, role: 'admin' })}>Admin (everything)</button>
          <button type="button" className={inv.role !== 'admin' ? 'on' : ''} onClick={() => setInv({ ...inv, role: 'crew' })}>Choose access</button>
        </div>
        {inv.role !== 'admin' && <AccessPicker value={inv.permissions} onChange={(permissions) => setInv({ ...inv, permissions })} />}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send invite'}</button>
      </form>
    </div>
  )
}
