import { useEffect, useState } from 'react'
import { supabase, isDemo } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { toast } from '../lib/toast'
import { Field, Loading } from '../components/ui'

export default function Team() {
  const { session } = useAuth()
  const [people, setPeople] = useState(null)
  const [inv, setInv] = useState({ email: '', full_name: '', role: 'crew' })
  const [busy, setBusy] = useState(false)

  const load = () => supabase.from('profiles').select('*').order('created_at').then(({ data }) => setPeople(data || []))
  useEffect(() => { load() }, [])

  const setRole = async (p, role) => {
    if (p.id === session.user.id && role !== 'admin') return toast('You can’t remove your own admin access', 'error')
    const { error } = await supabase.from('profiles').update({ role }).eq('id', p.id)
    if (error) return toast(error.message, 'error')
    toast('Updated'); load()
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
    setInv({ email: '', full_name: '', role: 'crew' }); load()
  }

  if (!people) return <Loading />

  return (
    <div className="stack">
      <h1>Team</h1>
      <ul className="list">
        {people.map((p) => (
          <li key={p.id} className="list-row">
            <div className="grow"><div className="row-title">{p.full_name || 'Unnamed'}</div></div>
            <select value={p.role} onChange={(e) => setRole(p, e.target.value)} style={{ width: 'auto' }}>
              <option value="crew">Crew (field only)</option>
              <option value="admin">Admin (everything)</option>
            </select>
          </li>
        ))}
      </ul>

      <form className="card" onSubmit={invite}>
        <h2>Invite someone</h2>
        <p className="small muted">They’ll get an email with a link to set a password. Crew only ever see pick lists and the scanner, never prices or clients.</p>
        <Field label="Name"><input value={inv.full_name} onChange={(e) => setInv({ ...inv, full_name: e.target.value })} /></Field>
        <Field label="Email"><input required type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
        <Field label="Access">
          <select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}>
            <option value="crew">Crew</option><option value="admin">Admin</option>
          </select>
        </Field>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send invite'}</button>
      </form>
    </div>
  )
}
