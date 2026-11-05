import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { session } = useAuth()
  const loc = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('password') // password | link
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to={loc.state?.from || '/'} replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg('')
    if (mode === 'link') {
      const { error } = await supabase.auth.signInWithOtp({
        email, options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
      })
      setMsg(error ? error.message : 'Check your email for a sign-in link.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg('Email or password not right.')
    }
    setBusy(false)
  }

  return (
    <div className="center-page">
      <form className="card login" onSubmit={submit}>
        <h1 className="brand brand-lg">House & Hues</h1>
        <p className="muted">Inventory & bookings</p>
        <input type="email" required placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        {mode === 'password' && (
          <input type="password" required placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        )}
        <button className="btn btn-primary btn-block btn-big" disabled={busy}>
          {mode === 'link' ? 'Email me a link' : 'Sign in'}
        </button>
        <button type="button" className="btn btn-ghost btn-block"
          onClick={() => setMode(mode === 'link' ? 'password' : 'link')}>
          {mode === 'link' ? 'Use a password instead' : 'Email me a sign-in link instead'}
        </button>
        {msg && <p className="note">{msg}</p>}
      </form>
    </div>
  )
}
