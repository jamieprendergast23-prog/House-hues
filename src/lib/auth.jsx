import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { MAIN_AREAS } from './constants'

/** Short device description, e.g. "iPhone · Safari". */
export function deviceName(ua = navigator.userAgent) {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android phone' : 'Android tablet')
    : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : 'Other'
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const app = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone ? ' (home screen app)' : ''
  return `${os} · ${br}${app}`
}
const logActivity = (kind, page) => supabase.rpc('log_activity', { p_kind: kind, p_device: deviceName(), ...(page ? { p_page: page } : {}) }).then(() => {}, () => {})

/** Friendly name for the part of the app at this address (null = don't log). */
export function pageName(path, field) {
  const P = field ? 'Field: ' : ''
  if (path === '/') return field ? 'Field: Home' : 'Dashboard'
  if (path === '/logins') return null
  const rules = [
    [/^\/inventory\/new/, 'Add item'], [/^\/(inventory|i)\//, 'Stock item'], [/^\/inventory/, 'Stock'],
    [/^\/jobs\/new/, 'New house'], [/^\/jobs\//, 'House details'], [/^\/(jobs|houses)/, 'Houses'],
    [/^\/calendar/, 'Calendar'], [/^\/import/, 'Import'], [/^\/labels/, 'Labels'], [/^\/shop/, 'Shop'],
    [/^\/business/, 'Business details'], [/^\/team/, 'Team'], [/^\/pick\//, 'Pick list'], [/^\/scan/, 'Scan'],
  ]
  const hit = rules.find(([re]) => re.test(path))
  return hit ? P + hit[1] : null
}
export const logPage = (page) => page && logActivity('view', page)

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [canLogins, setCanLogins] = useState(false)
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
    // a real sign-in changes last_sign_in_at; otherwise this is the app being opened
    const key = `hh-signin-${session.user.id}`
    let seen = null
    try { seen = localStorage.getItem(key) } catch { /* ignore */ }
    const last = session.user.last_sign_in_at
    if (last && last !== seen) {
      try { localStorage.setItem(key, last) } catch { /* ignore */ }
      logActivity('sign_in')
    } else logActivity('open')
    supabase.rpc('can_view_logins').then(({ data }) => setCanLogins(data === true), () => setCanLogins(false))
  }, [session?.user?.id])

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
    <AuthCtx.Provider value={{ session, profile, loading, isAdmin, can, hasMain, home, fieldMode, setFieldMode, canLogins }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
