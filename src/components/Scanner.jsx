import { useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'
import { codeFromScan } from '../lib/format'

/**
 * Full-screen camera scanner.
 * continuous=true keeps scanning (packing day); otherwise closes after one scan.
 */
export default function Scanner({ onCode, onClose, continuous = false, title = 'Scan a QR label', children }) {
  const video = useRef(null)
  const last = useRef({ code: '', at: 0 })
  const [error, setError] = useState('')
  const [manual, setManual] = useState('')

  useEffect(() => {
    const scanner = new QrScanner(
      video.current,
      (res) => {
        const code = codeFromScan(res.data)
        const now = Date.now()
        if (code === last.current.code && now - last.current.at < 2500) return
        last.current = { code, at: now }
        navigator.vibrate?.(60)
        onCode(code)
        if (!continuous) scanner.stop()
      },
      { preferredCamera: 'environment', highlightScanRegion: true, maxScansPerSecond: 8 }
    )
    scanner.start().catch(() =>
      setError('Camera blocked. Allow camera access in your browser settings, or type the code below.'))
    return () => { scanner.stop(); scanner.destroy() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitManual = (e) => {
    e.preventDefault()
    if (manual.trim()) { onCode(codeFromScan(manual)); setManual('') }
  }

  return (
    <div className="scanner">
      <div className="scanner-top">
        <span>{title}</span>
        <button className="btn btn-ghost-light" onClick={onClose}>Done</button>
      </div>
      <div className="scanner-view">
        <video ref={video} playsInline muted />
        {error && <p className="scanner-error">{error}</p>}
      </div>
      {children}
      <form className="scanner-manual" onSubmit={submitManual}>
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Or type code e.g. HH-0042"
          autoCapitalize="characters"
        />
        <button className="btn btn-primary">Go</button>
      </form>
    </div>
  )
}
