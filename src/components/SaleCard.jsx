import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isDemo, supabase, friendlyError } from '../lib/supabase'
import { toast } from '../lib/toast'
import { Modal, Field } from './ui'

const cash = (n) => Number(n || 0).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2, minimumFractionDigits: 0 })

/** Retire a piece, optionally listing it in the online shop at a price. */
export function RetireDialog({ item, onClose, onDone }) {
  const [list, setList] = useState(true)
  const [price, setPrice] = useState(item.sale_price ?? '')
  const [note, setNote] = useState(item.sale_note || '')
  const [busy, setBusy] = useState(false)

  const go = async (e) => {
    e.preventDefault()
    if (list && !(Number(price) > 0)) return toast('Add a price to list it for sale', 'error')
    setBusy(true)
    const patch = { status: 'retired', for_sale: list, sale_price: list ? Number(price) : item.sale_price, sale_note: list ? (note.trim() || null) : item.sale_note }
    const { error } = await supabase.from('items').update(patch).eq('id', item.id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast(list ? 'Retired and listed in the shop' : 'Retired')
    onDone(patch)
  }

  return (
    <Modal title="Retire this piece" onClose={onClose}>
      <form className="stack" onSubmit={go}>
        <p className="small muted" style={{ margin: 0 }}>It comes out of stock and can’t be picked for houses any more.</p>
        <label className={`perm ${list ? 'on' : ''}`}>
          <input type="checkbox" checked={list} onChange={(e) => setList(e.target.checked)} />
          <span><b>List it for sale</b><small>Shows in the online shop with its photo, size and price. Buyers pay by card and pick up from Griffith.</small></span>
        </label>
        {list && (
          <>
            <Field label="Sale price ($)"><input type="number" min="1" step="1" inputMode="decimal" required value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
            <Field label="Note for buyers (optional)" hint="e.g. small mark on the left arm"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </>
        )}
        <div className="row sticky-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary grow" disabled={busy}>{busy ? 'Saving…' : list ? 'Retire and list' : 'Retire'}</button>
        </div>
      </form>
    </Modal>
  )
}

/** On a retired piece: shop status, price, mark sold, or bring back into stock. */
export function SaleCard({ item, onChange }) {
  const [price, setPrice] = useState(item.sale_price ?? '')
  const [note, setNote] = useState(item.sale_note || '')
  const [busy, setBusy] = useState(false)
  const held = item.reserved_until && new Date(item.reserved_until) > new Date() && !item.sold_at

  const save = async (patch, msg) => {
    setBusy(true)
    const { error } = await supabase.from('items').update(patch).eq('id', item.id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast(msg); onChange(patch)
  }

  const status = item.sold_at ? `Sold ${new Date(item.sold_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
    : held ? 'Someone is checking out now'
    : item.for_sale ? 'Listed in the shop' : 'Not listed'

  return (
    <section className="card stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>For sale</h2>
        <span className={`tc-badge ${item.sold_at ? 'urgent' : item.for_sale ? 'ok' : 'warn'}`}>{status}</span>
      </div>
      {!item.sold_at && (
        <div className="grid2">
          <Field label="Price ($)"><input type="number" min="1" step="1" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          <Field label="Note for buyers"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></Field>
        </div>
      )}
      <div className="row wrap">
        {!item.sold_at && !item.for_sale && (
          <button className="btn btn-primary" disabled={busy || !(Number(price) > 0)} onClick={() => save({ for_sale: true, sale_price: Number(price), sale_note: note.trim() || null }, 'Listed in the shop')}>List in shop</button>
        )}
        {!item.sold_at && item.for_sale && (
          <>
            <button className="btn btn-primary" disabled={busy || !(Number(price) > 0)} onClick={() => save({ sale_price: Number(price), sale_note: note.trim() || null }, 'Saved')}>Save</button>
            <button className="btn" disabled={busy || held} onClick={() => save({ for_sale: false }, 'Taken off the shop')}>Take off shop</button>
            <button className="btn" disabled={busy || held} onClick={() => { if (confirm('Mark as sold (sold in person)?')) save({ sold_at: new Date().toISOString(), reserved_until: null }, 'Marked sold') }}>Sold in person</button>
          </>
        )}
        {item.sold_at && <Link className="btn" to="/shop">See shop orders</Link>}
        {!item.sold_at && <ShopLink className="btn btn-ghost" />}
        {!item.sold_at && (
          <button className="btn btn-ghost" disabled={busy || held} onClick={() => save({ status: 'available', for_sale: false }, 'Back in stock')}>Bring back into stock</button>
        )}
      </div>
    </section>
  )
}

export { cash }

/** Opens the public shop: a new tab live, or in place in the demo (it has no real web address). */
export function ShopLink({ className }) {
  return isDemo ? <Link className={className} to="/sale">View shop</Link>
    : <a className={className} href="/sale" target="_blank" rel="noreferrer">View shop</a>
}
