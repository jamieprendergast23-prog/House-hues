// Public: start paying for the pieces in the cart.
// Holds the pieces so nobody else can buy them, then returns a Stripe Checkout link.
import { randomBytes } from 'node:crypto'
import { json, db, shopReady, stripe, site, HOLD_MINUTES, SESSION_MINUTES } from '../lib/shop.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  if (!shopReady()) return json(503, { error: 'Online payments aren’t switched on yet. Please contact us to buy.' })
  const p = await req.json().catch(() => ({}))
  const ids = [...new Set((p.ids || []).filter((x) => UUID.test(String(x))))].slice(0, 20)
  if (!ids.length) return json(400, { error: 'Your cart is empty' })

  const admin = db()
  const now = new Date()
  const hold = `pending:${randomBytes(9).toString('hex')}`

  // hold every piece that is still for sale and not held by someone else
  const { data: held, error } = await admin.from('items')
    .update({ reserved_until: new Date(now.getTime() + HOLD_MINUTES * 60_000).toISOString(), reserved_session: hold })
    .in('id', ids)
    .eq('for_sale', true).eq('status', 'retired').is('sold_at', null).gt('sale_price', 0)
    .or(`reserved_until.is.null,reserved_until.lt."${now.toISOString()}"`)
    .select('id, name, sale_price, photo_url')
  if (error) return json(500, { error: 'Couldn’t start checkout. Please try again.' })

  const release = () => admin.from('items').update({ reserved_until: null, reserved_session: null }).eq('reserved_session', hold)
  if ((held || []).length !== ids.length) {
    await release()
    const ok = new Set((held || []).map((h) => h.id))
    return json(409, { error: 'Sorry, something in your cart has just sold or is being bought by someone else.', unavailable: ids.filter((i) => !ok.has(i)) })
  }

  try {
    const line_items = {}
    held.forEach((it, i) => {
      line_items[i] = {
        quantity: 1,
        price_data: {
          currency: 'aud',
          unit_amount: Math.round(Number(it.sale_price) * 100),
          product_data: { name: it.name, ...(it.photo_url?.startsWith('https://') ? { images: { 0: it.photo_url } } : {}) },
        },
      }
    })
    const session = await stripe('checkout/sessions', {
      mode: 'payment',
      line_items,
      success_url: `${site()}/sale/thanks?s={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site()}/sale?cancelled=1`,
      expires_at: Math.floor(now.getTime() / 1000) + SESSION_MINUTES * 60,
      phone_number_collection: { enabled: 'true' },
      billing_address_collection: 'auto',
      custom_text: { submit: { message: 'Pick up from Griffith NSW. We’ll be in touch to arrange a time.' } },
      payment_intent_data: { description: `House & Hues: ${held.map((h) => h.name).join(', ')}`.slice(0, 990) },
    })
    await admin.from('items').update({ reserved_session: session.id }).eq('reserved_session', hold)
    return json(200, { url: session.url })
  } catch (err) {
    await release()
    return json(502, { error: `Payment page couldn’t open: ${err.message}` })
  }
}
