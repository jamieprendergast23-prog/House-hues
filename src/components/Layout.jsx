import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ERP } from '../lib/features'
import { Brand } from './ui'

const NAV = ERP ? [
  ['/', 'Home', '⌂'],
  ['/jobs', 'Jobs', '▤'],
  ['/inventory', 'Stock', '▦'],
  ['/calendar', 'Calendar', '▣'],
  ['/requests', 'Requests', '✉'],
] : [
  ['/', 'Overview', '◎'],
  ['/inventory', 'Stock', '▦'],
  ['/houses', 'Houses', '⌂'],
  ['/calendar', 'Calendar', '▣'],
  ['/import', 'Import', '⇪'],
]

export default function Layout({ children }) {
  const { setFieldMode } = useAuth()
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
          {!ERP && <NavLink to="/dashboard">Dashboard</NavLink>}
          <NavLink to="/team">Team</NavLink>
        </nav>
        <div className="topbar-actions">
          <button className="btn btn-small" onClick={() => { nav('/'); setTimeout(() => setFieldMode(true), 50) }}>Field mode</button>
          <button className="btn btn-small btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>
      <main className="main">{children}</main>
      <nav className="bottomnav">
        {NAV.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <span className="bn-icon">{icon}</span>
            <span>{label}</span>
            {to === '/requests' && newCount > 0 && <b className="badge">{newCount}</b>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
