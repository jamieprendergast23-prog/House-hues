import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { configured, isDemo } from './lib/supabase'
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
import StockHome from './pages/StockHome'
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
import FieldItem from './field/FieldItem'

export default function App() {
  if (!configured) return <NotConfigured />
  return (
    <AuthProvider>
      <Toaster />
      {isDemo && <div className="demo-bar">Demo with sample data. Changes reset on refresh.</div>}
      <Routes>
        {ERP && <Route path="/book" element={<Book />} />}
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<Protected />} />
      </Routes>
    </AuthProvider>
  )
}

function Protected() {
  const { session, loading, fieldMode } = useAuth()
  const loc = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />

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
        <Route path="/" element={ERP ? <Dashboard /> : <StockHome />} />
        <Route path="/import" element={<ImportStock />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/inventory/:id" element={<ItemDetail />} />
        <Route path="/i/:code" element={<ItemDetail byCode />} />
        <Route path="/labels" element={<Labels />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        {(ERP || PLANNER) && <Route path="/calendar" element={<CalendarPage />} />}
        <Route path="/houses" element={<Houses />} />
        <Route path="/business" element={<Business />} />
        <Route path="/dashboard" element={<Dashboard2 />} />
        {ERP && <Route path="/requests" element={<Requests />} />}
        <Route path="/team" element={<Team />} />
        <Route path="/pick/:jobId" element={<PickList />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
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
