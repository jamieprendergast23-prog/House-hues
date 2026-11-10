// Stripe calls this after checkout. Paid: mark the pieces sold and record the order.
// Expired/abandoned: release the hold so the pieces go back on sale.
import { json, db, verifySignature } from '../lib/shop.mjs'

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  const raw = await req.text()
  if (!verifySignature(raw, req.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) {
    return json(400, { error: 'Bad signature' })
  }
  const event = JSON.parse(raw)
  const s = event.data?.object || {}
  const admin = db()

  if ((event.type === 'checkout.session.completed' && s.payment_status === 'paid') || event.type === 'checkout.session.async_payment_succeeded') {
    const { data: items } = await admin.from('items').select('id, name, sale_price').eq('reserved_session', s.id)
    const list = items || []
    const now = new Date().toISOString()
    if (list.length) {
      await admin.from('items').update({ sold_at: now, reserved_until: null }).eq('reserved_session', s.id)
    }
    const c = s.customer_details || {}
    await admin.from('shop_orders').upsert({
      stripe_session: s.id,
      item_ids: list.map((i) => i.id),
      items: list.map((i) => ({ id: i.id, name: i.name, price: Number(i.sale_price) })),
      total: (s.amount_total || 0) / 100,
      buyer_name: c.name || null,
      buyer_email: c.email || null,
      buyer_phone: c.phone || null,
    }, { onConflict: 'stripe_session', ignoreDuplicates: true })
  }

  if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
    await admin.from('items').update({ reserved_until: null, reserved_session: null })
      .eq('reserved_session', s.id).is('sold_at', null)
  }

  return json(200, { received: true })
}
