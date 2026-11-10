import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, friendlyError, fetchAll } from '../lib/supabase'
import { toast } from '../lib/toast'
import { Loading, Thumb } from '../components/ui'
import Icon from '../components/Icon'
import { ShopLink } from '../components/SaleCard'

const cash = (n) => Number(n || 0).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2, minimumFractionDigits: 0 })
const when = (iso) => new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })

/** Online shop: orders to hand over, and what's listed. */
export default function ShopOrders() {
  const [orders, setOrders] = useState(null)
  const [listed, setListed] = useState([])

  const load = () => {
    supabase.from('shop_orders').select('*').order('created_at', { ascending: false }).then(({ data }) => setOrders(data || []))
    fetchAll(() => supabase.from('v_items').select('id, name, sku, photo_url, sale_price, for_sale, sold_at, status').eq('status', 'retired').eq('for_sale', true).is('sold_at', null).order('code'))
      .then(setListed).catch(() => setListed([]))
  }
  useEffect(() => { load() }, [])

  const collected = async (o, done) => {
    const { error } = await supabase.from('shop_orders').update({ status: done ? 'collected' : 'paid', collected_at: done ? new Date().toISOString() : null }).eq('id', o.id)
    if (error) return toast(friendlyError(error), 'error')
    toast(done ? 'Marked as picked up' : 'Moved back to waiting'); load()
  }

  if (!orders) return <Loading />
  const waiting = orders.filter((o) => o.status === 'paid')
  const done = orders.filter((o) => o.status !== 'paid')
  const month = new Date().toISOString().slice(0, 7)
  const monthTotal = orders.filter((o) => o.created_at.startsWith(month) && o.status !== 'refunded').reduce((a, o) => a + Number(o.total), 0)

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Shop</h1>
        <ShopLink className="btn" />
      </div>
      <p className="small muted">Your public shop is at <b>app.houseandhues.com.au/sale</b>. Pieces appear there when you retire them and tick “List it for sale”.</p>

      <div className="stats">
        <div className="stat"><b>{listed.length}</b><span>listed now</span></div>
        <div className={`stat ${waiting.length ? 'warn' : ''}`}><b>{waiting.length}</b><span>to hand over</span></div>
        <div className="stat"><b>{cash(monthTotal)}</b><span>sold this month</span></div>
      </div>

      <section className="card">
        <h2>To hand over</h2>
        {waiting.length === 0 ? <p className="small muted">No orders waiting.</p> : (
          <ul className="list">{waiting.map((o) => <Order key={o.id} o={o} onDone={() => collected(o, true)} />)}</ul>
        )}
      </section>

      <section className="card">
        <h2>Listed for sale</h2>
        {listed.length === 0 ? <p className="small muted">Nothing listed. Retire a piece and tick “List it for sale”.</p> : (
          <ul className="list">
            {listed.map((i) => (
              <li key={i.id}><Link className="list-row" to={`/inventory/${i.id}`}>
                <Thumb url={i.photo_url} size={44} />
                <div className="grow"><div className="row-title">{i.name}</div><div className="row-sub">{i.sku || ''}</div></div>
                <b>{cash(i.sale_price)}</b>
              </Link></li>
            ))}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section className="card">
          <h2>Picked up</h2>
          <ul className="list">{done.slice(0, 30).map((o) => <Order key={o.id} o={o} onUndo={() => collected(o, false)} />)}</ul>
        </section>
      )}
    </div>
  )
}

function Order({ o, onDone, onUndo }) {
  return (
    <li className="list-row order-row">
      <div className="grow">
        <div className="row between"><span className="row-title">{o.buyer_name || 'Buyer'}</span><b>{cash(o.total)}</b></div>
        <div className="row-sub">{(o.items || []).map((i) => i.name).join(', ')}</div>
        <div className="row-sub">
          Paid {when(o.created_at)}
          {o.buyer_phone && <> · <a href={`tel:${o.buyer_phone}`}>{o.buyer_phone}</a></>}
          {o.buyer_email && <> · <a href={`mailto:${o.buyer_email}?subject=${encodeURIComponent('Your House & Hues order: pick up')}`}>{o.buyer_email}</a></>}
          {o.collected_at && <> · picked up {when(o.collected_at)}</>}
        </div>
      </div>
      {onDone && <button className="btn btn-small btn-primary" onClick={onDone}><Icon name="check" size={16} /> Picked up</button>}
      {onUndo && <button className="btn btn-small btn-ghost" onClick={onUndo}>Undo</button>}
    </li>
  )
}
