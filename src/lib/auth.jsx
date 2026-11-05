import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fieldPref, setFieldPref] = useState(() => localStorage.getItem('hh-field') === '1')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data }) => { setProfile(data); setLoading(false) })
  }, [session])

  const isAdmin = profile?.role === 'admin'
  // crew are always in Field Mode; admin can switch in and out
  const fieldMode = !isAdmin || fieldPref
  const setFieldMode = (on) => {
    localStorage.setItem('hh-field', on ? '1' : '0')
    setFieldPref(on)
  }

  return (
    <AuthCtx.Provider value={{ session, profile, loading, isAdmin, fieldMode, setFieldMode }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
