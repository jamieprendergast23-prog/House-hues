import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ERP } from '../lib/features'
import { Brand } from './ui'
import Icon from './Icon'

// [path, label, icon, area needed]
const ALL_NAV = ERP ? [
  ['/', 'Home', 'dashboard', 'dashboard'],
  ['/jobs', 'Jobs', 'jobs', 'houses'],
  ['/inventory', 'Stock', 'stock', 'stock'],
  ['/calendar', 'Calendar', 'calendar', 'calendar'],
  ['/requests', 'Requests', 'mail', 'admin'],
] : [
  ['/', 'Dashboard', 'dashboard', 'dashboard'],
  ['/inventory', 'Stock', 'stock', 'stock'],
  ['/houses', 'Houses', 'house', 'houses'],
  ['/calendar', 'Calendar', 'calendar', 'calendar'],
  ['/import', 'Import', 'import', 'stock'],
]

export default function Layout({ children }) {
  const { setFieldMode, can, isAdmin, canLogins } = useAuth()
  const NAV = ALL_NAV.filter(([, , , p]) => (p === 'admin' ? isAdmin : can(p)))
  const nav = useNavigate()
  const [newCount, setNewCount] = useState(0)

  useEffect(() => {
    if (!ERP) return
    supabase.from('booking_requests').select('id', { count: 'exact', head: true }).eq('status', 'new')
      .then(({ count }) => setNewCount(count || 0))
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand-link"><Brand /></NavLink>
        <nav className="topnav">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              {label}{to === '/requests' && newCount > 0 && <b className="badge">{newCount}</b>}
            </NavLink>
          ))}
          {can('stock') && !ERP && <NavLink to="/shop">Shop</NavLink>}
          {isAdmin && <NavLink to="/team">Team</NavLink>}
          {canLogins && <NavLink to="/logins">Logins</NavLink>}
        </nav>
        <div className="topbar-actions">
          {can('field') && <button className="btn btn-small" onClick={() => { nav('/'); setTimeout(() => setFieldMode(true), 50) }}>Field mode</button>}
          <button className="btn btn-small btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>
      <main className="main">{children}</main>
      <nav className="bottomnav">
        {NAV.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <span className="bn-icon"><Icon name={icon} size={22} /></span>
            <span>{label}</span>
            {to === '/requests' && newCount > 0 && <b className="badge">{newCount}</b>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
