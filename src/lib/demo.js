// In-memory stand-in for Supabase so the app can be previewed with sample data.
// Only used when built with VITE_DEMO=1. Resets on refresh.
import { today, addDays } from './format'

const uid = () => crypto.randomUUID()
const T = today()
const d = (n) => addDays(T, n)
const nowISO = () => new Date().toISOString()

// ---------- sample data ----------
const ADMIN = { id: 'u-admin', full_name: 'Owner', role: 'admin', created_at: nowISO() }
const CREW = { id: 'u-crew', full_name: 'Sam (crew)', role: 'crew', created_at: nowISO() }

const STOCK = [
  ['Linen 3-seater sofa', 'Sofa', 'Oatmeal', '220 x 90 cm', 'Bay 1'],
  ['Linen 3-seater sofa', 'Sofa', 'Charcoal', '220 x 90 cm', 'Bay 1'],
  ['Velvet 2-seater sofa', 'Sofa', 'Sage', '170 x 85 cm', 'Bay 1'],
  ['Boucle accent chair', 'Armchair', 'Cream', null, 'Bay 1'],
  ['Boucle accent chair', 'Armchair', 'Cream', null, 'Bay 1'],
  ['Rattan armchair', 'Armchair', 'Natural', null, 'Bay 1'],
  ['Round oak coffee table', 'Coffee table', 'Natural oak', '90 cm', 'Bay 2'],
  ['Travertine coffee table', 'Coffee table', 'Stone', '110 x 60 cm', 'Bay 2'],
  ['Oak dining table', 'Dining table', 'Natural oak', '180 x 90 cm', 'Bay 2'],
  ['Round white dining table', 'Dining table', 'White', '120 cm', 'Bay 2'],
  ...Array.from({ length: 6 }, () => ['Rattan dining chair', 'Dining chair', 'Natural', null, 'Bay 2']),
  ...Array.from({ length: 4 }, () => ['Black spindle chair', 'Dining chair', 'Black', null, 'Bay 2']),
  ['Queen bed frame, upholstered', 'Bed frame', 'Stone', 'Queen', 'Bay 3'],
  ['Queen bed frame, timber', 'Bed frame', 'Walnut', 'Queen', 'Bay 3'],
  ['Double bed frame', 'Bed frame', 'White', 'Double', 'Bay 3'],
  ['Queen mattress', 'Mattress', null, 'Queen', 'Bay 3'],
  ['Queen mattress', 'Mattress', null, 'Queen', 'Bay 3'],
  ['Double mattress', 'Mattress', null, 'Double', 'Bay 3'],
  ['Oak bedside table', 'Bedside table', 'Oak', null, 'Bay 3'],
  ['Oak bedside table', 'Bedside table', 'Oak', null, 'Bay 3'],
  ['Jute rug', 'Rug', 'Natural', '200 x 300 cm', 'Rack A'],
  ['Wool rug', 'Rug', 'Ivory', '160 x 230 cm', 'Rack A'],
  ['Ceramic table lamp', 'Lamp', 'White', null, 'Shelf 4'],
  ['Ceramic table lamp', 'Lamp', 'White', null, 'Shelf 4'],
  ['Arc floor lamp', 'Lamp', 'Brass', null, 'Shelf 4'],
  ['Abstract canvas, large', 'Art', 'Earth tones', '120 x 90 cm', 'Art rack'],
  ['Framed botanical print', 'Art', 'Green', '60 x 80 cm', 'Art rack'],
  ['Arched floor mirror', 'Mirror', 'Black', '180 cm', 'Art rack'],
  ['Linen cushion set (4)', 'Cushion', 'Rust', null, 'Tub 7'],
  ['Faux olive tree', 'Plant', 'Green', '160 cm', 'Bay 4'],
]

function seed() {
  const db = {
    profiles: [ADMIN, CREW], items: [], item_costs: [], clients: [], jobs: [],
    job_finance: [], job_items: [], booking_requests: [], _itemSeq: 1, _jobSeq: 1001,
  }
  STOCK.forEach(([name, category, colour, dimensions, shed_location], i) => {
    const id = uid()
    db.items.push({
      id, code: `HH-${String(db._itemSeq++).padStart(4, '0')}`, name, category, colour, dimensions,
      description: null, shed_location, condition: i === 5 ? 'needs_repair' : 'good',
      status: i === 5 ? 'repair' : 'available', photo_url: null,
      notes: i === 5 ? 'Broken weave on left arm' : null, created_at: nowISO(), updated_at: nowISO(),
    })
    db.item_costs.push({ item_id: id, purchase_cost: 80 + ((i * 37) % 900), replacement_value: 120 + ((i * 53) % 1200) })
  })
  const c = (name, agency, email, phone) => { const r = { id: uid(), name, agency, email, phone, kind: agency ? 'agent' : 'homeowner', created_at: nowISO() }; db.clients.push(r); return r }
  const sarah = c('Sarah Bennett', 'Riverina Realty', 'sarah@example.com', '0400 111 222')
  const tom = c('Tom Lucas', 'Banna Property Co', 'tom@example.com', '0400 333 444')
  const mel = c('Mel Rossi', null, 'mel@example.com', '0400 555 666')
  const job = (o, fin) => {
    const r = {
      id: uid(), job_number: db._jobSeq++, type: 'staging', status: 'enquiry', client_id: null,
      property_address: '', suburb: 'Griffith', access_notes: null, site_visit_date: null, consult_date: null,
      pack_date: null, install_date: null, hire_weeks: 6, collection_date: null, unpack_date: null,
      notes: null, created_at: nowISO(), updated_at: nowISO(), ...o,
    }
    db.jobs.push(r)
    if (fin) db.job_finance.push({ job_id: r.id, ...fin })
    return r
  }
  const it = (code) => db.items.find((x) => x.code === code)
  const assign = (j, codes, room, packed, returned) => codes.forEach((code) => db.job_items.push({
    id: uid(), job_id: j.id, item_id: it(code).id, room, period: hold(j),
    packed_at: packed ? nowISO() : null, packed_by: null, installed_at: null,
    returned_at: returned ? nowISO() : null, returned_by: null, created_at: nowISO(),
  }))

  const a = job({ status: 'installed', client_id: sarah.id, property_address: '14 Banna Ave', pack_date: d(-21), install_date: d(-20),
    access_notes: 'Lockbox on side gate, code 2468', site_visit_date: d(-30) },
    { quote_amount: 3200, deposit_amount: 1600, deposit_paid_on: d(-25) })
  assign(a, ['HH-0001', 'HH-0004', 'HH-0007', 'HH-0021', 'HH-0026', 'HH-0028'], 'Living', true)
  assign(a, ['HH-0017', 'HH-0020', 'HH-0023', 'HH-0024'], 'Master bed', true)

  const b = job({ status: 'booked', client_id: tom.id, property_address: '7 Kooyoo St', pack_date: T, install_date: d(1),
    access_notes: 'Agent meeting crew 8am. Narrow stairs to bedrooms.', site_visit_date: d(-6) },
    { quote_amount: 4100, deposit_amount: 4100, deposit_paid_on: d(-2), paid_in_full_on: d(-2) })
  assign(b, ['HH-0002', 'HH-0005', 'HH-0008', 'HH-0022'], 'Living')
  assign(b, ['HH-0009', 'HH-0011', 'HH-0012', 'HH-0013', 'HH-0014'], 'Dining')
  assign(b, ['HH-0018', 'HH-0019', 'HH-0025', 'HH-0027'], 'Master bed')

  const e = job({ status: 'installed', client_id: sarah.id, property_address: '3 Wakaden St', pack_date: d(-39), install_date: d(-38) },
    { quote_amount: 2600, deposit_amount: 1300, deposit_paid_on: d(-45), paid_in_full_on: d(-30) })
  assign(e, ['HH-0003', 'HH-0029', 'HH-0032'], 'Living', true)

  const f = job({ status: 'booked', client_id: tom.id, property_address: '22 Yambil St', site_visit_date: d(3), pack_date: d(9), install_date: d(10) }, { quote_amount: 3800 })
  assign(f, ['HH-0010', 'HH-0015', 'HH-0016'], 'Dining')
  assign(f, ['HH-0030', 'HH-0031'], 'Living')
  job({ type: 'consult', status: 'consult_booked', client_id: mel.id, property_address: '51 Jondaryan Ave', consult_date: d(2) }, { quote_amount: 250, paid_in_full_on: d(-1) })

  db.booking_requests.push(
    { id: uid(), created_at: nowISO(), name: 'Jess Carter', email: 'jess@example.com', phone: '0400 777 888', agency: 'Riverina Realty',
      property_address: '9 Ulong St', suburb: 'Griffith', service_type: 'staging', preferred_date: d(10), property_type: 'House', bedrooms: 3,
      occupied: false, message: 'Listing goes live in 2 weeks. Living, dining and master please.', status: 'new', job_id: null },
    { id: uid(), created_at: nowISO(), name: 'Anna Lee', email: 'anna@example.com', phone: '0400 999 000', agency: null,
      property_address: '4 Calabria Rd', suburb: 'Hanwood', service_type: 'consult', preferred_date: d(5), property_type: 'House', bedrooms: 4,
      occupied: true, message: 'Want to restyle before selling.', status: 'new', job_id: null },
  )
  return db
}

// ---------- domain logic mirroring the SQL ----------
function hold(j) {
  const start = j.pack_date || j.install_date
  if (!start) return null
  let end = j.unpack_date || j.collection_date ||
    (j.install_date ? addDays(j.install_date, j.hire_weeks * 7) : addDays(j.pack_date, j.hire_weeks * 7))
  if (end < start) end = start
  return [start, end]
}
const overlaps = (a, b) => a && b && a[0] <= b[1] && b[0] <= a[1]
const parseRange = (s) => { const m = /\[(.+),(.+)\]/.exec(s || ''); return m ? [m[1], m[2]] : null }
const fmtRange = (r) => (r ? `[${r[0]},${addDays(r[1], 1)})` : null)

let db = seed()
let session = { user: { id: ADMIN.id, email: 'owner@househues.demo' }, access_token: 'demo' }
const authListeners = new Set()

function vItems() {
  return db.items.map((i) => {
    const out = db.job_items.filter((x) => x.item_id === i.id && x.packed_at && !x.returned_at)
      .sort((a, b) => b.packed_at.localeCompare(a.packed_at))[0]
    const nxt = db.job_items.filter((x) => x.item_id === i.id && !x.packed_at && !x.returned_at && x.period[1] >= T)
      .sort((a, b) => a.period[0].localeCompare(b.period[0]))[0]
    const oj = out && db.jobs.find((j) => j.id === out.job_id)
    const nj = nxt && db.jobs.find((j) => j.id === nxt.job_id)
    return {
      ...i, out_job_id: oj?.id || null, out_address: oj?.property_address || null, out_since: out?.packed_at || null,
      next_job_id: nj?.id || null, next_address: nj?.property_address || null, next_start: nxt?.period[0] || null,
    }
  })
}

const err = (message, code = 'P0001') => ({ data: null, error: { message, code } })
const clashFor = (itemId, period, exceptId) =>
  db.job_items.some((x) => x.item_id === itemId && x.id !== exceptId && !x.returned_at && overlaps(x.period, period))

function rowsOf(table) {
  if (table === 'v_items') return vItems()
  if (table === 'jobs') return db.jobs.map((j) => ({ ...j, hold_period: fmtRange(hold(j)) }))
  return db[table]
}

// ---------- select parsing + embeds ----------
function splitTop(s) {
  const out = []; let depth = 0, cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
function embed(table, row, name, sub) {
  const clone = (o) => (o ? { ...o } : null)
  if (table === 'jobs') {
    if (name === 'clients') return clone(db.clients.find((c) => c.id === row.client_id))
    if (name === 'job_finance') return clone(db.job_finance.find((f) => f.job_id === row.id))
    if (name === 'job_items') {
      const ls = db.job_items.filter((x) => x.job_id === row.id)
      return sub.trim() === 'count' ? [{ count: ls.length }] : ls.map(clone)
    }
  }
  if (table === 'job_items') {
    if (name === 'items') return clone(db.items.find((i) => i.id === row.item_id))
    if (name === 'jobs') return clone(db.jobs.find((j) => j.id === row.job_id))
  }
  return null
}
function project(table, rows, sel) {
  const embeds = splitTop(sel || '*').map((t) => /^(\w+)\((.*)\)$/s.exec(t)).filter(Boolean)
  return rows.map((r) => {
    const o = { ...r }
    if (table === 'job_items' && o.period) o.period = fmtRange(o.period)
    for (const [, name, sub] of embeds) o[name] = embed(table, r, name, sub)
    return o
  })
}

// ---------- query builder ----------
class Query {
  constructor(table) { this.table = table; this.filters = []; this.orders = []; this.op = 'select'; this.sel = '*' }
  select(sel = '*', opts = {}) { if (this.op === 'select') this.opts = opts; this.sel = sel; this.returning = true; return this }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this }
  in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this }
  not(c, op, v) { const vs = v.replace(/[()]/g, '').split(','); this.filters.push((r) => !vs.includes(r[c])); return this }
  ilike(c, v) { const s = v.toLowerCase(); this.filters.push((r) => (r[c] || '').toLowerCase() === s); return this }
  order(c, o = {}) { this.orders.push([c, o.ascending !== false, o.nullsFirst]); return this }
  limit(n) { this.lim = n; return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybe'; return this }
  insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this }
  upsert(row) { this.op = 'upsert'; this.payload = [row]; return this }
  update(f) { this.op = 'update'; this.payload = f; return this }
  delete() { this.op = 'delete'; return this }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej) }

  match(rows) { return rows.filter((r) => this.filters.every((f) => f(r))) }

  finish(rows) {
    if (this.opts?.head) return { data: null, count: rows.length, error: null }
    let out = project(this.table, rows, this.sel)
    for (const [c, asc, nf] of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => {
        const x = a[c], y = b[c]
        if (x == null && y == null) return 0
        if (x == null) return nf ? -1 : 1
        if (y == null) return nf ? 1 : -1
        return (x > y ? 1 : x < y ? -1 : 0) * (asc ? 1 : -1)
      })
    }
    if (this.lim) out = out.slice(0, this.lim)
    if (this.one) {
      if (!out.length) return this.one === 'single' ? err('No rows', 'PGRST116') : { data: null, error: null }
      return { data: out[0], error: null }
    }
    return { data: out, error: null, count: out.length }
  }

  run() {
    const t = this.table
    if (this.op === 'select') return this.finish(this.match(rowsOf(t)))

    if (this.op === 'insert') {
      const made = []
      for (const p of this.payload) {
        const r = { id: uid(), created_at: nowISO(), ...p }
        if (t === 'items') Object.assign(r, { code: `HH-${String(db._itemSeq++).padStart(4, '0')}`, condition: 'good', status: 'available', updated_at: nowISO(), ...p })
        if (t === 'jobs') Object.assign(r, { job_number: db._jobSeq++, status: 'enquiry', hire_weeks: 6, ...p })
        if (t === 'clients' && !r.kind) r.kind = 'agent'
        if (t === 'job_items') {
          const j = db.jobs.find((x) => x.id === r.job_id)
          const period = j && hold(j)
          if (!period) return err('Set the packing or install date on this job before adding items')
          if (db.job_items.some((x) => x.job_id === r.job_id && x.item_id === r.item_id)) return err('dup', '23505')
          if (clashFor(r.item_id, period)) return err('no_double_booking', '23P01')
          Object.assign(r, { period, room: r.room || 'Living', packed_at: null, returned_at: null })
        }
        if (t === 'item_costs' || t === 'job_finance') delete r.id
        made.push(r)
      }
      db[t].push(...made)
      return this.returning ? this.finish(made) : { data: null, error: null }
    }

    if (this.op === 'upsert') {
      const key = t === 'item_costs' ? 'item_id' : 'job_id'
      const p = this.payload[0]
      const ex = db[t].find((r) => r[key] === p[key])
      ex ? Object.assign(ex, p) : db[t].push({ ...p })
      return { data: null, error: null }
    }

    if (this.op === 'update') {
      const targets = this.match(db[t])
      for (const r of targets) {
        if (t === 'jobs') {
          const before = hold(r)
          const next = { ...r, ...this.payload }
          const after = hold(next)
          if (after && JSON.stringify(after) !== JSON.stringify(before)) {
            const mine = db.job_items.filter((x) => x.job_id === r.id && !x.returned_at)
            if (mine.some((m) => db.job_items.some((o) => o.item_id === m.item_id && o.job_id !== r.id && !o.returned_at && overlaps(o.period, after))))
              return err('no_double_booking', '23P01')
            mine.forEach((m) => (m.period = after))
          }
          if (next.status === 'cancelled' && r.status !== 'cancelled')
            db.job_items = db.job_items.filter((x) => !(x.job_id === r.id && !x.packed_at))
          Object.assign(r, this.payload, { updated_at: nowISO() })
        } else Object.assign(r, this.payload)
      }
      return this.returning ? this.finish(this.match(rowsOf(t))) : { data: null, error: null }
    }

    if (this.op === 'delete') {
      const targets = new Set(this.match(db[t]))
      if (t === 'items' && [...targets].some((i) => db.job_items.some((x) => x.item_id === i.id)))
        return err('fk', '23503')
      db[t] = db[t].filter((r) => !targets.has(r))
      if (t === 'jobs') { const ids = new Set([...targets].map((j) => j.id)); db.job_finance = db.job_finance.filter((f) => !ids.has(f.job_id)) }
      return { data: null, error: null }
    }
  }
}

// ---------- RPCs ----------
const byCode = (code) => db.items.find((i) => i.code === String(code).trim().toUpperCase())
const RPC = {
  available_items({ p_job_id }) {
    const j = db.jobs.find((x) => x.id === p_job_id)
    const p = j && hold(j)
    return vItems().filter((v) => v.status === 'available' &&
      !db.job_items.some((x) => x.job_id === p_job_id && x.item_id === v.id) &&
      !db.job_items.some((x) => x.item_id === v.id && !x.returned_at && overlaps(x.period, p)))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  },
  job_date_conflicts({ p_job_id, p_range }) {
    const r = parseRange(p_range)
    const out = []
    for (const m of db.job_items.filter((x) => x.job_id === p_job_id && !x.returned_at)) {
      for (const o of db.job_items.filter((x) => x.item_id === m.item_id && x.job_id !== p_job_id && !x.returned_at && overlaps(x.period, r))) {
        const i = db.items.find((x) => x.id === m.item_id), j = db.jobs.find((x) => x.id === o.job_id)
        out.push({ item_code: i.code, item_name: i.name, other_job: j.job_number, other_address: j.property_address })
      }
    }
    return out
  },
  scan_pack({ p_job_id, p_code }) {
    const it = byCode(p_code)
    if (!it) return { result: 'unknown_code' }
    const ji = db.job_items.find((x) => x.job_id === p_job_id && x.item_id === it.id)
    if (!ji) return { result: 'not_on_list', name: it.name, code: it.code }
    if (ji.packed_at) return { result: 'already', name: it.name, code: it.code, room: ji.room }
    ji.packed_at = nowISO()
    return { result: 'packed', name: it.name, code: it.code, room: ji.room }
  },
  scan_return({ p_code, p_shed_location }) {
    const it = byCode(p_code)
    if (!it) return { result: 'unknown_code' }
    const ji = db.job_items.filter((x) => x.item_id === it.id && x.packed_at && !x.returned_at)[0]
    if (!ji) return { result: 'not_out', name: it.name, code: it.code }
    ji.returned_at = nowISO()
    if (p_shed_location?.trim()) it.shed_location = p_shed_location.trim()
    return { result: 'returned', name: it.name, code: it.code, from: db.jobs.find((j) => j.id === ji.job_id)?.property_address }
  },
  set_job_item_state({ p_job_item_id, p_state }) {
    const x = db.job_items.find((r) => r.id === p_job_item_id)
    if (!x) return null
    const now = nowISO()
    if (p_state === 'packed') x.packed_at ||= now
    if (p_state === 'unpacked') x.packed_at = null
    if (p_state === 'installed') x.installed_at = now
    if (p_state === 'returned') x.returned_at = now
    if (p_state === 'unreturned') x.returned_at = null
    return null
  },
  flag_item({ p_item_id, p_condition, p_note }) {
    const i = db.items.find((r) => r.id === p_item_id)
    i.condition = p_condition
    if (p_condition === 'needs_repair') i.status = 'repair'
    if (p_note?.trim()) i.notes = [i.notes, `${new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}: ${p_note.trim()}`].filter(Boolean).join('\n')
    return null
  },
}

// ---------- public client ----------
const photos = new Map()
export const demoClient = {
  from: (t) => new Query(t),
  rpc: async (name, args) => ({ data: RPC[name](args || {}), error: null }),
  auth: {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: (fn) => { authListeners.add(fn); return { data: { subscription: { unsubscribe: () => authListeners.delete(fn) } } } },
    signInWithPassword: async ({ email }) => {
      const prof = /crew/i.test(email) ? CREW : ADMIN
      session = { user: { id: prof.id, email }, access_token: 'demo' }
      authListeners.forEach((f) => f('SIGNED_IN', session))
      return { error: null }
    },
    signInWithOtp: async () => ({ error: { message: 'Sign-in links work once it’s live. In the demo, use any email + password (put “crew” in the email to see the crew view).' } }),
    signOut: async () => { session = null; authListeners.forEach((f) => f('SIGNED_OUT', null)); return { error: null } },
    updateUser: async () => ({ error: null }),
  },
  storage: {
    from: () => ({
      upload: async (path, blob) => { photos.set(path, URL.createObjectURL(blob)); return { error: null } },
      getPublicUrl: (path) => ({ data: { publicUrl: photos.get(path) } }),
    }),
  },
}

export async function demoBookingRequest(f) {
  db.booking_requests.unshift({
    id: uid(), created_at: nowISO(), name: f.name, email: f.email, phone: f.phone, agency: f.agency || null,
    property_address: f.property_address, suburb: f.suburb || null, service_type: f.service_type,
    preferred_date: f.preferred_date || null, property_type: f.property_type, bedrooms: f.bedrooms ? Number(f.bedrooms) : null,
    occupied: f.occupied === '' ? null : f.occupied === 'true', message: f.message || null, status: 'new', job_id: null,
  })
}
