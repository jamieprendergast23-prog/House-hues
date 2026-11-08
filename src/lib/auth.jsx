import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { MAIN_AREAS } from './constants'

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
  const perms = profile?.permissions || ['field']
  const can = (p) => isAdmin || perms.includes(p)
  // can they use the office side of the app at all?
  const hasMain = isAdmin || MAIN_AREAS.some((p) => perms.includes(p))
  // field-only people are always in Field Mode; others can switch if they have it
  const fieldMode = !hasMain || (fieldPref && can('field'))
  // where to land if they can't see the dashboard
  const home = !hasMain ? '/' : can('dashboard') ? '/' : can('houses') ? '/houses' : can('stock') ? '/inventory' : '/calendar'
  const setFieldMode = (on) => {
    localStorage.setItem('hh-field', on ? '1' : '0')
    setFieldPref(on)
  }

  return (
    <AuthCtx.Provider value={{ session, profile, loading, isAdmin, can, hasMain, home, fieldMode, setFieldMode }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
