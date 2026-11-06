import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, naturalCompare } from '../lib/supabase'
import { QrImg, Loading, Empty } from '../components/ui'

// Printable sheet sized for A4 21-up labels (Avery L7160 / 63.5 × 38.1 mm).
// Works fine on plain paper too: print, cut, and tape/cable-tie on.
export default function Labels() {
  const nav = useNavigate()
  const [items, setItems] = useState(null)
  const [skip, setSkip] = useState(0)

  useEffect(() => {
    const ids = JSON.parse(sessionStorage.getItem('hh-labels') || '[]')
    if (!ids.length) { setItems([]); return }
    // fetch in chunks so long selections don't make the request URL too long
    const chunks = []
    for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150))
    Promise.all(chunks.map((c) => supabase.from('items').select('id, code, name, category').in('id', c)))
      .then((rs) => setItems(rs.flatMap((r) => r.data || [])
        .sort((a, b) => naturalCompare(a.category, b.category) || naturalCompare(a.name, b.name) || naturalCompare(a.code, b.code))))
  }, [])

  if (!items) return <Loading />
  if (!items.length) return <Empty>No items picked. Go to Stock and tap “Print QR labels”.</Empty>

  return (
    <div>
      <div className="page-head no-print">
        <h1>QR labels <span className="muted small">{items.length}</span></h1>
        <div className="row">
          <button className="btn btn-ghost" onClick={() => nav(-1)}>Back</button>
          <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
        </div>
      </div>
      <p className="no-print muted small">
        Sheet layout: A4, 21 labels (Avery L7160 or similar). Using a half-used sheet? Skip the used spots:{' '}
        <input type="number" min="0" max="20" value={skip} onChange={(e) => setSkip(Number(e.target.value) || 0)}
          style={{ width: 64, display: 'inline-block' }} />
      </p>
      <div className="label-sheet">
        {Array.from({ length: skip }).map((_, i) => <div key={`s${i}`} className="label" />)}
        {items.map((i) => (
          <div key={i.id} className="label">
            <QrImg code={i.code} size={110} />
            <div className="label-text">
              <strong>{i.code}</strong>
              <span>{i.name}</span>
              <small>House & Hues</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
