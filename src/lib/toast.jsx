import { useEffect, useState } from 'react'

// Tiny global toast: toast('Saved'), toast('Oops', 'error')
const listeners = new Set()
export function toast(text, kind = 'ok') {
  listeners.forEach((fn) => fn({ text, kind, id: Math.random() }))
}

export function Toaster() {
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    const fn = (m) => setMsg(m)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), msg.kind === 'error' ? 5000 : 2500)
    return () => clearTimeout(t)
  }, [msg])
  if (!msg) return null
  return (
    <div className={`toast toast-${msg.kind}`} role="status" onClick={() => setMsg(null)}>
      {msg.text}
    </div>
  )
}
