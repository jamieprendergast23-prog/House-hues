import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { configured, isDemo, supabase } from './lib/supabase'
import { AuthProvider, useAuth } from './lib/auth'
import { Toaster } from './lib/toast'
import { ERP, PLANNER } from './lib/features'
import Houses from './pages/Houses'
import Dashboard2 from './pages/Dashboard2'
import Business from './pages/Business'
import { Loading } from './components/ui'
import Layout from './components/Layout'
import FieldLayout from './field/FieldLayout'

import Login from './pages/Login'
import Book from './pages/Book'
import Dashboard from './pages/Dashboard'
import ImportStock from './pages/ImportStock'
import Inventory from './pages/Inventory'
import ItemDetail from './pages/ItemDetail'
import Labels from './pages/Labels'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import CalendarPage from './pages/Calendar'
import Requests from './pages/Requests'
import Team from './pages/Team'

import FieldHome from './field/FieldHome'
import PickList from './field/PickList'
import FieldScan from './field/FieldScan'
import Shop from './shop/Shop'
import ShopOrders from './pages/ShopOrders'
import FieldItem from './field/FieldItem'

export default function App() {
  const loc = useLocation()
  if (!configured) return <NotConfigured />
  return (
    <AuthProvider>
      <Toaster />
      {isDemo && !loc.pathname.startsWith('/sale') && <div className="demo-bar">Demo with sample data. Changes reset on refresh.</div>}
      <Routes>
        {ERP && <Route path="/book" element={<Book />} />}
        <Route path="/login" element={<Login />} />
        <Route path="/sale/*" element={<Shop />} />
        <Route path="/*" element={<Protected />} />
      </Routes>
    </AuthProvider>
  )
}

function Protected() {
  const { session, loading, fieldMode, hasMain, can, isAdmin, home } = useAuth()
  const loc = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (!hasMain && !can('field')) return <NoAccess />

  // only render a page if this person has that area switched on
  const need = (p, el) => (p === 'admin' ? isAdmin : can(p)) ? el : <Navigate to={home} replace />

  if (fieldMode) {
    return (
      <FieldLayout>
        <Routes>
          <Route path="/" element={<FieldHome />} />
          <Route path="/pick/:jobId" element={<PickList />} />
          <Route path="/scan" element={<FieldScan />} />
          <Route path="/i/:code" element={<FieldItem />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </FieldLayout>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={can('dashboard') ? (ERP ? <Dashboard /> : <Dashboard2 />) : <Navigate to={home} replace />} />
        <Route path="/import" element={need('stock', <ImportStock />)} />
        <Route path="/inventory" element={need('stock', <Inventory />)} />
        <Route path="/inventory/:id" element={need('stock', <ItemDetail />)} />
        <Route path="/i/:code" element={need('stock', <ItemDetail byCode />)} />
        <Route path="/labels" element={need('stock', <Labels />)} />
        <Route path="/jobs" element={need('houses', <Jobs />)} />
        <Route path="/jobs/:id" element={need('houses', <JobDetail />)} />
        {(ERP || PLANNER) && <Route path="/calendar" element={need('calendar', <CalendarPage />)} />}
        <Route path="/houses" element={need('houses', <Houses />)} />
        <Route path="/business" element={need('money', <Business />)} />
        <Route path="/shop" element={need('stock', <ShopOrders />)} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        {ERP && <Route path="/requests" element={need('admin', <Requests />)} />}
        <Route path="/team" element={need('admin', <Team />)} />
        <Route path="/pick/:jobId" element={need('houses', <PickList />)} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  )
}

function NoAccess() {
  return (
    <div className="center-page">
      <div className="card stack">
        <h1>No access yet</h1>
        <p>You’re signed in, but nothing has been switched on for you. Ask the owner to tick what you need on the Team page.</p>
        <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="center-page">
      <div className="card">
        <h1>House &amp; Hues</h1>
        <p>Supabase isn’t connected yet. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> in a <code>.env</code> file (local) or in
          Netlify &gt; Site settings &gt; Environment variables, then redeploy.</p>
      </div>
    </div>
  )
}
