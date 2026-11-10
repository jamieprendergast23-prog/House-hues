import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase, isDemo } from '../lib/supabase'
import { demoCheckout } from '../lib/demo'
import { Brand } from '../components/ui'
import Icon from '../components/Icon'
import PhotoViewer from '../components/PhotoViewer'

export const SHOP_EMAIL = 'hayley@houseandhues.com.au'
const price = (n) => Number(n || 0).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 2 })

// ---- cart (kept on this device) -------------------------------------------
const CartCtx = createContext(null)
const KEY = 'hh-cart'
const readCart = () => { try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] } }
const writeCart = (ids) => { try { localStorage.setItem(KEY, JSON.stringify(ids)) } catch { /* private mode */ } }

function useShopData() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const load = () => supabase.rpc('sale_items').then(({ data, error: e }) => {
    if (e) { setError('The shop couldn’t load. Please refresh.'); setItems([]) } else setItems(data || [])
  })
  useEffect(() => { load() }, [])
  return { items, error, reload: load }
}

export default function Shop() {
  const [cart, setCart] = useState(readCart)
  const data = useShopData()
  useEffect(() => { writeCart(cart) }, [cart])
  // drop anything from the cart that has since sold
  useEffect(() => {
    if (!data.items) return
    const live = new Set(data.items.map((i) => i.id))
    setCart((c) => (c.every((id) => live.has(id)) ? c : c.filter((id) => live.has(id))))
  }, [data.items])

  const value = useMemo(() => ({
    cart, data,
    add: (id) => setCart((c) => (c.includes(id) ? c : [...c, id])),
    remove: (id) => setCart((c) => c.filter((x) => x !== id)),
    clear: () => setCart([]),
  }), [cart, data])

  useEffect(() => { document.title = 'Shop · House & Hues' }, [])

  return (
    <CartCtx.Provider value={value}>
      <div className="shop">
        <header className="shop-top">
          <Link to="/sale" className="shop-brand" aria-label="House & Hues shop"><Brand /></Link>
          <Link to="/sale/cart" className="shop-cart-btn" aria-label={`Cart, ${cart.length} item${cart.length === 1 ? '' : 's'}`}>
            <CartIcon /> <span>Cart</span>{cart.length > 0 && <b className="shop-count">{cart.length}</b>}
          </Link>
        </header>
        <main className="shop-main">
          <Routes>
            <Route index element={<ShopList />} />
            <Route path="item/:id" element={<ShopItem />} />
            <Route path="cart" element={<ShopCart />} />
            <Route path="thanks" element={<ShopThanks />} />
            <Route path="*" element={<ShopList />} />
          </Routes>
        </main>
        <footer className="shop-foot">
          <p>Pre-loved pieces from our styling collection. Pick up from Griffith NSW.</p>
          <p>Questions? <a href={`mailto:${SHOP_EMAIL}`}>{SHOP_EMAIL}</a></p>
          <p className="shop-small">Secure card payments by Stripe. Prices in AUD, GST inclusive where applicable.</p>
        </footer>
      </div>
    </CartCtx.Provider>
  )
}

const CartIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 7h14l-1.4 11.2a1.5 1.5 0 0 1-1.5 1.3H7.9a1.5 1.5 0 0 1-1.5-1.3L5 7zM9 7V6a3 3 0 0 1 6 0v1" />
  </svg>
)

// ---- list ------------------------------------------------------------------
function ShopList() {
  const { data, cart, add } = useContext(CartCtx)
  const [cat, setCat] = useState('')
  const [sp] = useSearchParams()
  const cats = useMemo(() => [...new Set((data.items || []).map((i) => i.category).filter(Boolean))].sort(), [data.items])
  const shown = (data.items || []).filter((i) => !cat || i.category === cat)

  return (
    <>
      <section className="shop-hero">
        <p className="shop-eyebrow">The House &amp; Hues collection</p>
        <h1>Pieces for sale</h1>
        <p className="shop-lede">Furniture and decor that has styled homes across the Riverina, now looking for a home of its own. One of each, so when it’s gone, it’s gone.</p>
      </section>
      {sp.get('cancelled') && <p className="shop-note">Checkout cancelled. Your cart is still here.</p>}
      {cats.length > 1 && (
        <div className="shop-cats" role="tablist">
          <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>All</button>
          {cats.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      )}
      {!data.items ? <p className="shop-muted">Loading…</p>
        : data.error ? <p className="shop-note">{data.error}</p>
        : shown.length === 0 ? <p className="shop-muted shop-empty">Nothing for sale right now. Check back soon.</p>
        : (
          <div className="shop-grid">
            {shown.map((i) => (
              <article key={i.id} className="shop-card">
                <Link to={`/sale/item/${i.id}`} className="shop-img">
                  {i.photo_url ? <img src={i.photo_url} alt={i.name} loading="lazy" /> : <span className="shop-noimg"><Icon name="image" size={32} /></span>}
                </Link>
                <div className="shop-card-body">
                  <Link to={`/sale/item/${i.id}`} className="shop-name">{i.name}</Link>
                  <div className="shop-meta">{[i.category, i.dimensions].filter(Boolean).join(' · ')}</div>
                  <div className="shop-row">
                    <b className="shop-price">{price(i.sale_price)}</b>
                    {cart.includes(i.id)
                      ? <Link to="/sale/cart" className="shop-btn ghost">In cart</Link>
                      : <button className="shop-btn" onClick={() => add(i.id)}>Add to cart</button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
    </>
  )
}

// ---- one piece -------------------------------------------------------------
function ShopItem() {
  const { id } = useParams()
  const { data, cart, add } = useContext(CartCtx)
  const [view, setView] = useState(false)
  const nav = useNavigate()
  if (!data.items) return <p className="shop-muted">Loading…</p>
  const i = data.items.find((x) => x.id === id)
  if (!i) return (
    <div className="shop-empty">
      <h1>This piece has sold</h1>
      <p className="shop-muted">Sorry, it’s found a new home. <Link to="/sale">See what’s still available</Link>.</p>
    </div>
  )
  const inCart = cart.includes(i.id)
  return (
    <article className="shop-detail">
      <Link to="/sale" className="shop-back">← All pieces</Link>
      <div className="shop-detail-grid">
        <button className="shop-detail-img" onClick={() => i.photo_url && setView(true)} aria-label="Enlarge photo">
          {i.photo_url ? <img src={i.photo_url} alt={i.name} /> : <span className="shop-noimg"><Icon name="image" size={48} /></span>}
        </button>
        <div className="shop-detail-info">
          <p className="shop-eyebrow">{i.category}</p>
          <h1>{i.name}</h1>
          <p className="shop-price big">{price(i.sale_price)}</p>
          {i.description && <p>{i.description}</p>}
          <dl className="shop-dl">
            {i.dimensions && <><dt>Size</dt><dd>{i.dimensions}</dd></>}
            {i.colour && <><dt>Colour</dt><dd>{i.colour}</dd></>}
            <dt>Pick up</dt><dd>Griffith NSW</dd>
          </dl>
          {i.sale_note && <p className="shop-note">{i.sale_note}</p>}
          <div className="shop-actions">
            {inCart
              ? <button className="shop-btn big" onClick={() => nav('/sale/cart')}>View cart</button>
              : <button className="shop-btn big" onClick={() => { add(i.id); nav('/sale/cart') }}>Buy now</button>}
            {!inCart && <button className="shop-btn ghost big" onClick={() => add(i.id)}>Add to cart</button>}
          </div>
          <p className="shop-small">Only one available. Questions? <a href={`mailto:${SHOP_EMAIL}?subject=${encodeURIComponent(`Question about ${i.name}`)}`}>Email us</a>.</p>
        </div>
      </div>
      {view && <PhotoViewer photos={[{ url: i.photo_url, caption: i.name }]} onClose={() => setView(false)} />}
    </article>
  )
}

// ---- cart & checkout -------------------------------------------------------
function ShopCart() {
  const { data, cart, remove } = useContext(CartCtx)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const nav = useNavigate()
  const lines = (data.items || []).filter((i) => cart.includes(i.id))
  const total = lines.reduce((a, i) => a + Number(i.sale_price), 0)

  const checkout = async () => {
    setBusy(true); setErr('')
    try {
      if (isDemo) { await demoCheckout(lines.map((l) => l.id)); nav('/sale/thanks?demo=1'); return }
      const res = await fetch('/.netlify/functions/shop-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: lines.map((l) => l.id) }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (out.unavailable) out.unavailable.forEach(remove)
        data.reload()
        throw new Error(out.error || 'Checkout couldn’t start')
      }
      window.location.href = out.url
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <section className="shop-cart">
      <h1>Your cart</h1>
      {!data.items ? <p className="shop-muted">Loading…</p> : lines.length === 0 ? (
        <p className="shop-muted">Your cart is empty. <Link to="/sale">Browse pieces</Link>.</p>
      ) : (
        <>
          <ul className="shop-lines">
            {lines.map((i) => (
              <li key={i.id}>
                <Link to={`/sale/item/${i.id}`} className="shop-line-img">{i.photo_url ? <img src={i.photo_url} alt="" /> : null}</Link>
                <div className="grow">
                  <Link to={`/sale/item/${i.id}`} className="shop-name">{i.name}</Link>
                  <div className="shop-meta">{i.dimensions}</div>
                </div>
                <b>{price(i.sale_price)}</b>
                <button className="shop-x" onClick={() => remove(i.id)} aria-label={`Remove ${i.name}`}><Icon name="close" size={16} /></button>
              </li>
            ))}
          </ul>
          <div className="shop-total"><span>Total</span><b>{price(total)}</b></div>
          <p className="shop-small">Pick up from Griffith NSW. After you pay we’ll contact you to arrange a time. Your pieces are held for you while you check out.</p>
          {err && <p className="shop-note">{err}</p>}
          <button className="shop-btn big block" onClick={checkout} disabled={busy}>{busy ? 'Opening secure checkout…' : `Pay ${price(total)}`}</button>
          <p className="shop-small center">Card, Apple Pay and Google Pay. Secure payment by Stripe.</p>
        </>
      )}
    </section>
  )
}

function ShopThanks() {
  const { clear, data } = useContext(CartCtx)
  useEffect(() => { clear(); data.reload() }, [])
  return (
    <section className="shop-empty">
      <p className="shop-eyebrow">Order confirmed</p>
      <h1>Thank you</h1>
      <p>Your payment went through and a receipt is on its way to your email. We’ll be in touch shortly to arrange pick up in Griffith.</p>
      <p><Link to="/sale" className="shop-btn ghost">Keep browsing</Link></p>
    </section>
  )
}
