import { ERP } from './features'

export const CATEGORIES = [
  'Sofa', 'Armchair', 'Dining table', 'Dining chair', 'Coffee table', 'Side table',
  'Bed frame', 'Mattress', 'Bedside table', 'Bedding', 'Rug', 'Lamp', 'Art',
  'Mirror', 'Cushion', 'Throw', 'Plant', 'Decor', 'Outdoor', 'Other',
]

export const ROOMS = [
  'Living', 'Dining', 'Kitchen', 'Master bed', 'Bed 2', 'Bed 3', 'Bed 4',
  'Study', 'Entry', 'Bathroom', 'Outdoor',
]

export const CONDITIONS = { good: 'Good', fair: 'Fair', needs_repair: 'Needs repair' }
export const ITEM_STATUS = { available: 'Available', repair: 'In repair', retired: 'Retired' }

// Pipelines follow the owner's real process
export const PIPELINES = {
  // phase 1: just where the furniture is
  simple: [
    ['booked', 'Booked'],
    ['packing', 'Packed'],
    ['installed', 'At property'],
    ['collected', 'Collected'],
    ['complete', 'Back in shed'],
  ],
  staging: [
    ['enquiry', 'Enquiry'],
    ['site_visit', 'Site visit'],
    ['quote_sent', 'Quote sent'],
    ['accepted', 'Accepted'],
    ['booked', 'Paid & booked'],
    ['packing', 'Packing'],
    ['installed', 'Installed'],
    ['collected', 'Collected'],
    ['complete', 'Unpacked & done'],
  ],
  consult: [
    ['enquiry', 'Enquiry'],
    ['paid', 'Paid'],
    ['consult_booked', 'Consult booked'],
    ['follow_up_sent', 'Follow-up sent'],
    ['complete', 'Done'],
  ],
  design: [
    ['enquiry', 'Enquiry'],
    ['quote_sent', 'Quote sent'],
    ['in_progress', 'In progress'],
    ['complete', 'Done'],
  ],
}

export const TYPE_LABEL = { staging: 'Staging', consult: 'Consult', design: 'Design' }

export function statusLabel(type, status) {
  if (status === 'cancelled') return 'Cancelled'
  const p = ERP ? PIPELINES[type] || PIPELINES.staging : PIPELINES.simple
  return (p.find(([k]) => k === status) || [status, status])[1]
}

// Calendar event kinds derived from job dates
export const EVENT_KINDS = {
  site_visit_date: { label: 'Site visit', cls: 'ev-visit' },
  consult_date: { label: 'Consult', cls: 'ev-visit' },
  pack_date: { label: 'Packing', cls: 'ev-pack' },
  install_date: { label: 'Install', cls: 'ev-install' },
  hire_end: { label: 'Hire ends', cls: 'ev-end' },
  collection_date: { label: 'Collection', cls: 'ev-collect' },
  unpack_date: { label: 'Unpack', cls: 'ev-pack' },
}
