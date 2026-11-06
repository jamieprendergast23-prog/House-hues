import { NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { toast } from '../lib/toast'
import { Modal, Brand } from '../components/ui'

export default function FieldLayout({ children }) {
  const { isAdmin, setFieldMode, profile } = useAuth()
  const nav = useNavigate()
  const [menu, setMenu] = useState(false)
  const [pw, setPw] = useState('')

  const savePw = async (e) => {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) return toast(error.message, 'error')
    toast('Password set'); setPw(''); setMenu(false)
  }

  return (
    <div className="app field">
      <header className="field-top">
        <NavLink to="/" className="brand-link"><Brand /></NavLink>
        <button className="btn btn-ghost-light" onClick={() => setMenu(true)}>{profile?.full_name?.split(' ')[0] || 'Menu'} ☰</button>
      </header>
      <main className="field-main">{children}</main>
      <nav className="field-bar">
        <NavLink to="/" end className="field-tab">Jobs</NavLink>
        <NavLink to="/scan" className="field-tab field-tab-scan">Scan</NavLink>
      </nav>

      {menu && (
        <Modal title="Menu" onClose={() => setMenu(false)}>
          <div className="stack">
            {isAdmin && (
              <button className="btn btn-primary btn-big btn-block" onClick={() => { setFieldMode(false); setMenu(false); nav('/') }}>
                Back to admin
              </button>
            )}
            <form onSubmit={savePw} className="stack">
              <input type="password" minLength={8} placeholder="New password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
              <button className="btn btn-block" disabled={pw.length < 8}>Set password</button>
            </form>
            <button className="btn btn-ghost btn-block" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
