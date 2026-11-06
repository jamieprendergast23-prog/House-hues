// Read an .xlsx in the browser, including photos.
// Handles both kinds of Excel picture:
//   1. floating pictures sitting over a row (drawings)
//   2. "Place in Cell" pictures (richData / IMAGE)
// Nothing is uploaded until the user confirms the import.
import JSZip from 'jszip'

const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const parse = (xml) => new DOMParser().parseFromString(xml, 'application/xml')
const byTag = (el, tag) => Array.from(el.getElementsByTagNameNS('*', tag))
const first = (el, tag) => byTag(el, tag)[0]

function resolve(base, target) {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

async function readXml(zip, path) {
  const f = zip.file(path)
  return f ? parse(await f.async('text')) : null
}

// rels file for a part: xl/worksheets/sheet1.xml -> xl/worksheets/_rels/sheet1.xml.rels
async function rels(zip, partPath) {
  const dir = partPath.split('/').slice(0, -1).join('/')
  const name = partPath.split('/').pop()
  const doc = await readXml(zip, `${dir}/_rels/${name}.rels`)
  const map = {}
  if (doc) for (const r of byTag(doc, 'Relationship')) {
    map[r.getAttribute('Id')] = { target: resolve(partPath, r.getAttribute('Target')), type: r.getAttribute('Type') || '' }
  }
  return map
}

const colIndex = (ref) => {
  const letters = ref.replace(/[0-9]/g, '')
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}
const rowIndex = (ref) => parseInt(ref.replace(/[A-Z]/g, ''), 10) - 1

export async function openWorkbook(file) {
  const zip = await JSZip.loadAsync(file)
  const wb = await readXml(zip, 'xl/workbook.xml')
  if (!wb) throw new Error('That doesn’t look like an Excel (.xlsx) file')
  const wbRels = await rels(zip, 'xl/workbook.xml')
  const sheets = byTag(wb, 'sheet').map((s) => ({
    name: s.getAttribute('name'),
    path: wbRels[s.getAttributeNS(NS_R, 'id') || s.getAttribute('r:id')]?.target,
  })).filter((s) => s.path && zip.file(s.path))

  // shared strings
  const strings = []
  const ss = await readXml(zip, 'xl/sharedStrings.xml')
  if (ss) for (const si of byTag(ss, 'si')) strings.push(byTag(si, 't').map((t) => t.textContent).join(''))

  const cellImages = await loadCellImages(zip)
  return { zip, sheets, strings, cellImages }
}

// "Place in Cell" pictures: cell vm -> metadata -> rich value -> rel -> media file
async function loadCellImages(zip) {
  const relList = await readXml(zip, 'xl/richData/richValueRel.xml')
  if (!relList) return null
  const relRels = await rels(zip, 'xl/richData/richValueRel.xml')
  const relTargets = byTag(relList, 'rel').map((r) => relRels[r.getAttributeNS(NS_R, 'id') || r.getAttribute('r:id')]?.target)

  // each rich value: its first <v> is the index into relTargets (for local images)
  const rv = await readXml(zip, 'xl/richData/rdrichvalue.xml')
  const values = rv ? byTag(rv, 'rv').map((r) => relTargets[parseInt(first(r, 'v')?.textContent, 10)]) : []

  // vm (1-based) -> rich value index, via metadata.xml when present
  const md = await readXml(zip, 'xl/metadata.xml')
  let vmToRv = null
  if (md) {
    const fut = byTag(md, 'futureMetadata').find((f) => f.getAttribute('name') === 'XLRICHVALUE')
    const rvbs = fut ? byTag(fut, 'rvb').map((b) => parseInt(b.getAttribute('i'), 10)) : []
    const vmBlock = first(md, 'valueMetadata')
    if (vmBlock) vmToRv = byTag(vmBlock, 'bk').map((bk) => rvbs[parseInt(first(bk, 'rc')?.getAttribute('v'), 10)])
  }
  return (vm) => {
    const i = vmToRv ? vmToRv[vm - 1] : vm - 1
    return values[i] ?? null
  }
}

/**
 * Read one sheet.
 * Returns rows: [{ n: rowNumber (0-based), cells: [string], images: [zipPath] }]
 */
export async function readSheet(book, sheet) {
  const { zip, strings, cellImages } = book
  const doc = await readXml(zip, sheet.path)
  const sRels = await rels(zip, sheet.path)
  const rows = new Map()
  const rowOf = (n) => { if (!rows.has(n)) rows.set(n, { n, cells: [], images: [] }); return rows.get(n) }

  for (const c of byTag(doc, 'c')) {
    const ref = c.getAttribute('r')
    if (!ref) continue
    const r = rowOf(rowIndex(ref)), ci = colIndex(ref)
    const t = c.getAttribute('t')
    const v = first(c, 'v')?.textContent ?? ''
    let val = v
    if (t === 's') val = strings[parseInt(v, 10)] ?? ''
    else if (t === 'inlineStr') val = byTag(c, 't').map((x) => x.textContent).join('')
    else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE'
    else if (t === 'e') val = ''
    const vm = c.getAttribute('vm')
    if (vm && cellImages) {
      const img = cellImages(parseInt(vm, 10))
      if (img) { r.images.push(img); val = '' }
    }
    r.cells[ci] = String(val)
  }

  // floating pictures anchored over rows
  for (const rel of Object.values(sRels)) {
    if (!rel.type.endsWith('/drawing')) continue
    const dr = await readXml(zip, rel.target)
    const dRels = await rels(zip, rel.target)
    if (!dr) continue
    const anchors = [...byTag(dr, 'twoCellAnchor'), ...byTag(dr, 'oneCellAnchor')]
    for (const a of anchors) {
      const from = first(a, 'from')
      const to = first(a, 'to')
      const blip = first(a, 'blip')
      if (!from || !blip) continue
      const embed = blip.getAttributeNS(NS_R, 'embed') || blip.getAttribute('r:embed')
      const target = dRels[embed]?.target
      if (!target) continue
      // a picture belongs to the row its middle sits in
      const r1 = parseInt(first(from, 'row').textContent, 10)
      const r2 = to ? parseInt(first(to, 'row').textContent, 10) : r1
      const toOff = to ? parseInt(first(to, 'rowOff')?.textContent || '0', 10) : 1
      const end = to && toOff === 0 && r2 > r1 ? r2 - 1 : r2
      rowOf(Math.round((r1 + end) / 2)).images.push(target)
    }
  }

  const out = [...rows.values()].sort((a, b) => a.n - b.n)
  const width = Math.max(0, ...out.map((r) => r.cells.length))
  for (const r of out) r.cells = Array.from({ length: width }, (_, i) => r.cells[i] ?? '')
  return out.filter((r) => r.images.length || r.cells.some((c) => c.trim()))
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }
export const canShow = (path) => Boolean(MIME[path.split('.').pop().toLowerCase()])

export async function imageBlob(book, path) {
  const ext = path.split('.').pop().toLowerCase()
  if (!MIME[ext]) return null // emf/wmf etc. can't be shown in a browser
  const data = await book.zip.file(path)?.async('uint8array')
  return data ? new Blob([data], { type: MIME[ext] }) : null
}
