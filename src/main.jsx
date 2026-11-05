import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from './App'
import './styles.css'

// the demo runs inside a hosted preview frame, so it keeps routes in memory
const isDemo = import.meta.env.VITE_DEMO === '1'
const Router = isDemo ? MemoryRouter : BrowserRouter
// preview frames block confirm() dialogs; in the demo just say yes
if (isDemo) { try { window.confirm = () => true } catch { /* ignore */ } }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>
)
