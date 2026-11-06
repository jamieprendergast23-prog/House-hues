import { hireEnd, parseDate } from '../lib/format'
import { toast } from '../lib/toast'

// "12th of September 2026", like her printed cards
export function longDate(s) {
  const d = parseDate(s)
  if (!d) return '—'
  const n = d.getDate()
  const suf = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
  return `${n}${suf} of ${d.toLocaleDateString('en-AU', { month: 'long' })} ${d.getFullYear()}`
}

export const paymentLabel = (fin) => (fin?.paid_in_full_on ? 'Paid in full' : fin?.deposit_paid_on ? 'Deposit paid' : 'Not paid yet')

export function hireCardLines(job, fin) {
  return [
    ['Address', job.property_address + (job.suburb ? `, ${job.suburb}` : '')],
    ['Install completed', longDate(job.install_date)],
    ['Hire start date', longDate(job.install_date)],
    ['Hire finish date', `${longDate(hireEnd(job))} (unless sold prior)`],
    ['Hire period', `${job.hire_weeks} weeks (unless sold prior)`],
    ['Payment', paymentLabel(fin)],
  ]
}

/** Her cork-board card: print it, copy it, or email it to the client after install */
export default function HireCard({ job, client, fin }) {
  const lines = hireCardLines(job, fin)
  const text = lines.map(([k, v]) => `${k}: ${v}`).join('\n')
  const first = client?.name?.split(' ')[0]
  const email = `Hi${first ? ` ${first}` : ''},\n\nThank you, your staging is all installed. Here are your dates:\n\n${text}\n\nIf the property sells sooner or you'd like to extend, just let me know.\n\nHouse & Hues`
  const subject = `Your staging dates – ${job.property_address}`

  const print = () => {
    document.body.classList.add('printing-card')
    setTimeout(() => {
      window.print()
      document.body.classList.remove('printing-card')
    }, 50)
  }

  return (
    <section className="card">
      <h2>Hire card</h2>
      <div className="hire-card">
        {lines.map(([k, v]) => <div key={k}><span>{k}:</span> {v}</div>)}
      </div>
      <div className="row">
        <a className="btn btn-primary" href={`mailto:${client?.email || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(email)}`}>Email client</a>
        <button type="button" className="btn" onClick={() => { navigator.clipboard?.writeText(email).then(() => toast('Copied'), () => toast('Couldn’t copy', 'error')) }}>Copy</button>
        <button type="button" className="btn" onClick={print}>Print card</button>
      </div>
      {!client?.email && <p className="small muted">Add the client’s email above to send it straight from here.</p>}
    </section>
  )
}
