import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, fetchAll } from '../lib/supabase'
import { CATEGORIES } from '../lib/constants'
import { today, fmtDate, money } from '../lib/format'
import { Loading, Thumb } from '../components/ui'
import Scanner from '../components/Scanner'

// Phase 1 home: everything about the stock at a glance
export default function StockHome() {
  const nav = useNavigate()
  const [d, setD] = useState(null)
  const [scan, setScan] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchAll(() => supabase.from('v_items').select('id, category, status, out_job_id, out_address, photo_url, shed_location, name, code, notes').order('id')).then((data) => ({ data })),
      fetchAll(() => supabase.from('item_costs').select('item_id, purchase_cost, replacement_value').order('item_id')).then((data) => ({ data })),
      supabase.from('jobs').select('id, property_address, status, pack_date, install_date, job_items(count)')
        .eq('type', 'staging').not('status', 'in', '(cancelled,complete)'),
    ]).then(([i, c, j]) => setD({ items: i.data || [], costs: c.data || [], jobs: j.data || [] }))
  }, [])

  const s = useMemo(() => {
    if (!d) return null
    const live = d.items.filter((i) => i.status !== 'retired')
    const out = live.filter((i) => i.out_job_id)
    const repair = live.filter((i) => i.status === 'repair')
    const cost = Object.fromEntries(d.costs.map((c) => [c.item_id, c]))
    const value = (list) => list.reduce((n, i) => n + Number(cost[i.id]?.replacement_value || cost[i.id]?.purchase_cost || 0), 0)

    const cats = {}
    for (const i of live) {
      const c = (cats[i.category] ||= { name: i.category, total: 0, out: 0, repair: 0 })
      c.total++
      if (i.out_job_id) c.out++
      if (i.status === 'repair') c.repair++
    }
    const order = (n) => { const k = CATEGORIES.indexOf(n); return k < 0 ? 99 : k }
    const byCat = Object.values(cats).sort((a, b) => order(a.name) - order(b.name))

    const byProp = {}
    for (const i of out) (byProp[i.out_job_id] ||= { id: i.out_job_id, address: i.out_address, n: 0 }).n++

    const t = today()
    const nextOut = d.jobs.filter((j) => (j.pack_date || j.install_date) >= t && j.job_items?.[0]?.count)
      .sort((a, b) => (a.pack_date || a.install_date).localeCompare(b.pack_date || b.install_date)).slice(0, 4)

    return {
      live, out, repair, byCat, nextOut, props: Object.values(byProp),
      noPhoto: live.filter((i) => !i.photo_url).length,
      noSpot: live.filter((i) => !i.shed_location).length,
      total: value(live), outValue: value(out),
    }
  }, [d])

  if (!s) return <Loading />

  return (
    <div className="stack">
      <div className="page-head"><h1>Stock overview</h1></div>

      <div className="quick">
        <button className="quick-btn primary" onClick={() => setScan(true)}><span>⌗</span>Scan</button>
        <Link className="quick-btn" to="/inventory/new"><span>＋</span>Add item</Link>
        <Link className="quick-btn" to="/import"><span>⇪</span>Import list</Link>
        <Link className="quick-btn" to="/inventory"><span>▦</span>All stock</Link>
      </div>

      <div className="stats">
        <Link to="/inventory" className="stat"><b>{s.live.length}</b><span>pieces</span></Link>
        <Link to="/inventory" className="stat"><b>{s.live.length - s.out.length - s.repair.length}</b><span>in the shed</span></Link>
        <Link to="/inventory" className="stat"><b>{s.out.length}</b><span>out at properties</span></Link>
        <Link to="/inventory" className="stat warn"><b>{s.repair.length}</b><span>need repair</span></Link>
      </div>

      {s.total > 0 && (
        <div className="card row between">
          <div><div className="muted small">Stock value</div><b className="big-num">{money(s.total)}</b></div>
          <div><div className="muted small">Out right now</div><b className="big-num">{money(s.outValue)}</b></div>
        </div>
      )}

      {s.live.length === 0 ? (
        <section className="card highlight">
          <h2>Get your stock in</h2>
          <p>Import your current spreadsheet, or add pieces one by one with a photo. Then print QR labels and stick them on.</p>
          <div className="row">
            <Link className="btn btn-primary" to="/import">Import spreadsheet</Link>
            <Link className="btn" to="/inventory/new">Add an item</Link>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>By category</h2>
          <table className="tbl">
            <thead><tr><th>Category</th><th>Total</th><th>In shed</th><th>Out</th></tr></thead>
            <tbody>
              {s.byCat.map((c) => (
                <tr key={c.name} onClick={() => nav('/inventory', { state: { cat: c.name } })}>
                  <td>{c.name}{c.repair > 0 && <span className="pill pill-warn" style={{ marginLeft: 6 }}>{c.repair} repair</span>}</td>
                  <td>{c.total}</td>
                  <td className="ok-text">{c.total - c.out - c.repair}</td>
                  <td>{c.out || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {s.props.length > 0 && (
        <section className="card">
          <h2>Out at properties</h2>
          <ul className="list">
            {s.props.map((p) => (
              <li key={p.id}><Link className="list-row" to={`/jobs/${p.id}`}>
                <div className="grow"><div className="row-title">{p.address}</div></div>
                <span className="pill pill-out">{p.n} pieces</span>
              </Link></li>
            ))}
          </ul>
        </section>
      )}

      {s.nextOut.length > 0 && (
        <section className="card">
          <h2>Going out next</h2>
          <ul className="list">
            {s.nextOut.map((j) => (
              <li key={j.id}><Link className="list-row" to={`/pick/${j.id}`}>
                <div className="grow">
                  <div className="row-title">{j.property_address}</div>
                  <div className="row-sub">{j.pack_date ? `Packing ${fmtDate(j.pack_date)}` : `Install ${fmtDate(j.install_date)}`}</div>
                </div>
                <span className="pill pill-muted">{j.job_items[0].count} pieces</span>
              </Link></li>
            ))}
          </ul>
        </section>
      )}

      {s.repair.length > 0 && (
        <section className="card">
          <h2>Needs repair</h2>
          <ul className="list">
            {s.repair.map((i) => (
              <li key={i.id}><Link className="list-row" to={`/inventory/${i.id}`}>
                <Thumb url={i.photo_url} size={44} />
                <div className="grow"><div className="row-title">{i.name}</div><div className="row-sub">{i.code}{i.notes ? ` · ${i.notes.split('\n').pop()}` : ''}</div></div>
              </Link></li>
            ))}
          </ul>
        </section>
      )}

      {s.live.length > 0 && (s.noPhoto > 0 || s.noSpot > 0) && (
        <p className="note small">
          Tidy-up: {s.noPhoto > 0 && <>{s.noPhoto} pieces have no photo. </>}
          {s.noSpot > 0 && <>{s.noSpot} have no shed spot.</>} Crew find things faster with both.
        </p>
      )}

      {scan && <Scanner onClose={() => setScan(false)} onCode={(code) => { setScan(false); nav(`/i/${code}`) }} />}
    </div>
  )
}
