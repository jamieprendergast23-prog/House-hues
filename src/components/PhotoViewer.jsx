import { useEffect, useState } from 'react'

/** Full-screen photo viewer: swipe/arrow through photos, tap ✕ or outside to close */
export default function PhotoViewer({ photos, start = 0, onClose }) {
  const [i, setI] = useState(start)
  const n = photos.length
  const go = (d) => setI((x) => (x + d + n) % n)

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n])

  let touchX = null
  const p = photos[i]
  return (
    <div className="viewer" onClick={onClose}
      onTouchStart={(e) => { touchX = e.touches[0].clientX }}
      onTouchEnd={(e) => { if (touchX === null) return; const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 50) { e.stopPropagation(); go(dx < 0 ? 1 : -1) } touchX = null }}>
      <div className="viewer-top" onClick={(e) => e.stopPropagation()}>
        <span>{p.label || ''}{n > 1 ? `  ${i + 1} / ${n}` : ''}</span>
        <button className="btn btn-ghost-light" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <img src={p.url} alt={p.label || ''} onClick={(e) => { e.stopPropagation(); if (n > 1) go(1) }} />
      {p.caption && <div className="viewer-cap">{p.caption}</div>}
    </div>
  )
}
