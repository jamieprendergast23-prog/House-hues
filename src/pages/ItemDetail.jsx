import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, friendlyError, fetchAll, naturalCompare } from '../lib/supabase'
import { CATEGORIES, CONDITIONS, ITEM_STATUS } from '../lib/constants'
import { fmtDate, compressImage } from '../lib/format'
import { toast } from '../lib/toast'
import { QrImg, Thumb, ItemWhere, Field, Loading, Empty } from '../components/ui'

const BLANK = {
  name: '', sku: '', subcategory: '', category: 'Furniture', colour: '', dimensions: '', description: '',
  shed_location: '', condition: 'good', status: 'available', notes: '', photo_url: null,
}

export default function ItemDetail({ byCode }) {
  const { id, code } = useParams()
  const nav = useNavigate()
  const isNew = id === 'new'
  const [item, setItem] = useState(isNew ? BLANK : null)
  const [costs, setCosts] = useState({})
  const [history, setHistory] = useState([])
  const [editing, setEditing] = useState(isNew)
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)
  const [copies, setCopies] = useState(1)
  const [all, setAll] = useState([])

  // her own categories / groups, for the pick lists in the form
  useEffect(() => {
    if (!editing) return
    fetchAll(() => supabase.from('items').select('category, subcategory').order('category')).then(setAll).catch(() => {})
  }, [editing])
  const lists = useMemo(() => ({
    cats: [...new Set([...all.map((r) => r.category), ...CATEGORIES])].filter(Boolean).sort(naturalCompare),
    subs: (cat) => [...new Set(all.filter((r) => r.category === cat).map((r) => r.subcategory))].filter(Boolean).sort(naturalCompare),
  }), [all])

  useEffect(() => {
    if (isNew) return
    const q = supabase.from('v_items').select('*')
    ;(byCode ? q.eq('code', code.toUpperCase()) : q.eq('id', id)).maybeSingle().then(async ({ data }) => {
      if (!data) { setMissing(true); return }
      setItem(data)
      const [c, h] = await Promise.all([
        supabase.from('item_costs').select('*').eq('item_id', data.id).maybeSingle(),
        supabase.from('job_items')
          .select('id, room, packed_at, returned_at, period, jobs(id, job_number, property_address, status)')
          .eq('item_id', data.id).order('created_at', { ascending: false }),
      ])
      setCosts(c.data || {})
      setHistory(h.data || [])
    })
  }, [id, code, byCode, isNew])

  if (missing) return <Empty>No item with that code. <Link to="/inventory">Back to stock</Link></Empty>
  if (!item) return <Loading />

  const set = (k) => (e) => setItem({ ...item, [k]: e.target.value })
  const setC = (k) => (e) => setCosts({ ...costs, [k]: e.target.value })

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const blob = await compressImage(file)
      const path = `${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from('item-photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('item-photos').getPublicUrl(path)
      setItem((it) => ({ ...it, photo_url: data.publicUrl }))
      if (!isNew && !editing) {
        await supabase.from('items').update({ photo_url: data.publicUrl }).eq('id', item.id)
        toast('Photo saved')
      }
    } catch (err) { toast(friendlyError(err), 'error') }
    setBusy(false)
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    const fields = {
      name: item.name.trim(), sku: item.sku?.trim() || null, subcategory: item.subcategory?.trim() || null, category: item.category, colour: item.colour || null,
      dimensions: item.dimensions || null, description: item.description || null,
      shed_location: item.shed_location || null, condition: item.condition,
      status: item.status, notes: item.notes || null, photo_url: item.photo_url,
    }
    const costRow = {
      purchase_cost: costs.purchase_cost || null, replacement_value: costs.replacement_value || null,
      purchased_on: costs.purchased_on || null, supplier: costs.supplier || null,
    }
    try {
      if (isNew) {
        const n = Math.max(1, Math.min(50, Number(copies) || 1))
        const rows = Array.from({ length: n }, () => fields)
        const { data, error } = await supabase.from('items').insert(rows).select('id')
        if (error) throw error
        await supabase.from('item_costs').insert(data.map((r) => ({ item_id: r.id, ...costRow })))
        toast(n > 1 ? `${n} items added` : 'Item added')
        nav(n > 1 ? '/inventory' : `/inventory/${data[0].id}`, { replace: true })
      } else {
        const { error } = await supabase.from('items').update(fields).eq('id', item.id)
        if (error) throw error
        await supabase.from('item_costs').upsert({ item_id: item.id, ...costRow })
        toast('Saved')
        setEditing(false)
      }
    } catch (err) { toast(friendlyError(err), 'error') }
    setBusy(false)
  }

  const remove = async () => {
    if (!confirm(`Delete ${item.name} (${item.code}) for good? If it’s been on jobs, retire it instead.`)) return
    const { error } = await supabase.from('items').delete().eq('id', item.id)
    if (error) return toast(friendlyError(error), 'error')
    toast('Deleted'); nav('/inventory', { replace: true })
  }

  if (editing) {
    return (
      <form onSubmit={save} className="stack">
        <div className="page-head">
          <h1>{isNew ? 'Add item' : `Edit ${item.code}`}</h1>
        </div>

        <div className="photo-pick">
          <Thumb url={item.photo_url} size={96} />
          <label className="btn">
            {busy ? 'Uploading…' : item.photo_url ? 'Change photo' : 'Take / add photo'}
            <input type="file" accept="image/*" capture="environment" hidden onChange={uploadPhoto} />
          </label>
        </div>

        <Field label="Description"><input required value={item.name} onChange={set('name')} placeholder="e.g. Linen 3-seater sofa" /></Field>
        <Field label="Your item code" hint="Your own code from the spreadsheet, e.g. V12. Optional."><input value={item.sku || ''} onChange={set('sku')} placeholder="V12" autoCapitalize="characters" /></Field>
        <div className="grid2">
          <Field label="Category">
            <input list="cats" required value={item.category || ''} onChange={set('category')} placeholder="Furniture" />
          </Field>
          <datalist id="cats">{lists.cats.map((c) => <option key={c} value={c} />)}</datalist>
          <datalist id="subcats">{lists.subs(item.category).map((c) => <option key={c} value={c} />)}</datalist>
          <Field label="Group" hint="Optional, e.g. Sofas & lounges">
            <input list="subcats" value={item.subcategory || ''} onChange={set('subcategory')} placeholder="Sofas & lounges" />
          </Field>
          <Field label="Colour"><input value={item.colour || ''} onChange={set('colour')} placeholder="Oatmeal" /></Field>
          <Field label="Size"><input value={item.dimensions || ''} onChange={set('dimensions')} placeholder="220 × 90 cm / Queen" /></Field>
          <Field label="Shed spot"><input value={item.shed_location || ''} onChange={set('shed_location')} placeholder="Bay 3" /></Field>
          <Field label="Condition">
            <select value={item.condition} onChange={set('condition')}>
              {Object.entries(CONDITIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={item.status} onChange={set('status')}>
              {Object.entries(ITEM_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Notes"><textarea rows={3} value={item.notes || ''} onChange={set('notes')} /></Field>

        <details className="card-soft">
          <summary>Cost & value (only you see this)</summary>
          <div className="grid2">
            <Field label="Paid ($)"><input type="number" step="0.01" inputMode="decimal" value={costs.purchase_cost || ''} onChange={setC('purchase_cost')} /></Field>
            <Field label="Replacement ($)"><input type="number" step="0.01" inputMode="decimal" value={costs.replacement_value || ''} onChange={setC('replacement_value')} /></Field>
            <Field label="Bought"><input type="date" value={costs.purchased_on || ''} onChange={setC('purchased_on')} /></Field>
            <Field label="From"><input value={costs.supplier || ''} onChange={setC('supplier')} /></Field>
          </div>
        </details>

        {isNew && (
          <Field label="How many identical?" hint="Each gets its own code and QR label. Handy for dining chairs, cushions, lamps.">
            <input type="number" min="1" max="50" inputMode="numeric" value={copies} onChange={(e) => setCopies(e.target.value)} />
          </Field>
        )}

        <div className="row sticky-actions">
          <button type="button" className="btn btn-ghost" onClick={() => isNew ? nav(-1) : setEditing(false)}>Cancel</button>
          <button className="btn btn-primary grow" disabled={busy}>{isNew ? 'Add to stock' : 'Save'}</button>
        </div>
      </form>
    )
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="item-title">{item.name}</h1>
          <div className="muted">{[item.sku, item.code].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setEditing(true)}>Edit</button>
        </div>
      </div>

      <div className="item-hero">
        {item.photo_url ? <img src={item.photo_url} alt="" /> : (
          <label className="photo-empty">Add photo
            <input type="file" accept="image/*" capture="environment" hidden onChange={uploadPhoto} />
          </label>
        )}
        <div className="qr-box">
          <QrImg code={item.code} size={120} />
          <strong>{item.code}</strong>
          <button className="btn btn-small btn-ghost" onClick={() => {
            sessionStorage.setItem('hh-labels', JSON.stringify([item.id])); nav('/labels')
          }}>Print label</button>
        </div>
      </div>

      <div className="card">
        <ItemWhere item={item} />
        {item.out_job_id && <p className="small">Since {fmtDate(item.out_since?.slice(0, 10))} · <Link to={`/jobs/${item.out_job_id}`}>open job</Link></p>}
        {item.next_job_id && <p className="small">Next booked: <Link to={`/jobs/${item.next_job_id}`}>{item.next_address}</Link> from {fmtDate(item.next_start)}</p>}
        <dl className="dl">
          <dt>Category</dt><dd>{item.category}{item.subcategory ? ` › ${item.subcategory}` : ''}</dd>
          {item.sku && <><dt>Your code</dt><dd>{item.sku}</dd></>}
          {costs.supplier && <><dt>Shop</dt><dd>{costs.supplier}</dd></>}
          {costs.purchase_cost && <><dt>Paid</dt><dd>${costs.purchase_cost}</dd></>}
          {item.colour && <><dt>Colour</dt><dd>{item.colour}</dd></>}
          {item.dimensions && <><dt>Size</dt><dd>{item.dimensions}</dd></>}
          <dt>Shed spot</dt><dd>{item.shed_location || '—'}</dd>
          <dt>Condition</dt><dd>{CONDITIONS[item.condition]}</dd>
          {costs.replacement_value && <><dt>Replacement</dt><dd>${costs.replacement_value}</dd></>}
        </dl>
        {item.notes && <p className="pre small">{item.notes}</p>}
      </div>

      <h2>Job history</h2>
      {history.length === 0 ? <Empty>Not used on a job yet.</Empty> : (
        <ul className="list">
          {history.map((h) => (
            <li key={h.id}>
              <Link className="list-row" to={`/jobs/${h.jobs.id}`}>
                <div className="grow">
                  <div className="row-title">{h.jobs.property_address}</div>
                  <div className="row-sub">#{h.jobs.job_number} · {h.room} · {h.returned_at ? 'Returned' : h.packed_at ? 'Out now' : 'Booked'}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="row">
        {item.status !== 'retired' && (
          <button className="btn btn-ghost" onClick={async () => {
            await supabase.from('items').update({ status: 'retired' }).eq('id', item.id)
            setItem({ ...item, status: 'retired' }); toast('Retired')
          }}>Retire item</button>
        )}
        <button className="btn btn-ghost danger" onClick={remove}>Delete</button>
      </div>
    </div>
  )
}
