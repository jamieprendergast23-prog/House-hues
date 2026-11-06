import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, friendlyError } from '../lib/supabase'
import { fmtDate } from '../lib/format'
import { toast } from '../lib/toast'
import { Loading, Empty, ItemWhere, ConditionPill } from '../components/ui'
import DamagePanel from '../components/DamagePanel'

export default function FieldItem() {
  const { code } = useParams()
  const [item, setItem] = useState(undefined)
  const [spot, setSpot] = useState('')

  const load = useCallback(() => {
    supabase.from('v_items').select('*').eq('code', code.toUpperCase()).maybeSingle()
      .then(({ data }) => { setItem(data); setSpot(data?.shed_location || '') })
  }, [code])
  useEffect(() => { load() }, [load])

  if (item === undefined) return <Loading />
  if (!item) return <Empty>No item with code {code}. <Link to="/scan">Scan again</Link></Empty>

  const backInShed = async () => {
    const { data, error } = await supabase.rpc('scan_return', { p_code: item.code, p_shed_location: spot })
    if (error) return toast(friendlyError(error), 'error')
    toast(data.result === 'returned' ? `Back in shed from ${data.from}` : 'It wasn’t marked as out')
    load()
  }


  return (
    <div className="stack">
      {item.photo_url && <img className="field-photo" src={item.photo_url} alt="" />}
      <div>
        <h1 className="field-title">{item.name}</h1>
        <p className="muted">{item.sku ? `${item.sku} · ` : ''}{item.code} · {item.category}{item.colour ? ` · ${item.colour}` : ''}{item.dimensions ? ` · ${item.dimensions}` : ''}</p>
        <div className="row-pills"><ItemWhere item={item} /><ConditionPill c={item.condition} /></div>
      </div>

      {item.out_job_id && (
        <div className="card">
          <p>Out at <Link to={`/pick/${item.out_job_id}`}><strong>{item.out_address}</strong></Link></p>
          <label className="field"><span className="field-label">Where are you putting it in the shed?</span>
            <input value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="e.g. Bay 3" /></label>
          <button className="btn btn-primary btn-big btn-block" onClick={backInShed}>Back in shed</button>
        </div>
      )}

      {item.next_job_id && (
        <div className="card">
          <p>Next job: <Link to={`/pick/${item.next_job_id}`}><strong>{item.next_address}</strong></Link></p>
          <p className="muted">from {fmtDate(item.next_start)}</p>
        </div>
      )}

      {!item.out_job_id && !item.next_job_id && item.status === 'available' && (
        <div className="card"><p>Free. Lives at <strong>{item.shed_location || 'no spot set'}</strong>.</p></div>
      )}

      <DamagePanel item={item} onChange={(f) => setItem({ ...item, ...f })} />

      <Link to="/scan" className="btn btn-block btn-big">Scan another</Link>
    </div>
  )
}
