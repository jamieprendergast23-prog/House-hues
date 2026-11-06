// The order pieces go into a house on install day (rugs down first, styling last).
// Works off category, sub-group and description so it suits her own category names.
export const INSTALL_STEPS = [
  [1, 'Rugs', /\brug|runner|mat\b/],
  [2, 'Beds & mattresses', /\bbed|mattress|ensemble|bedhead/],
  [3, 'Big furniture', /sofa|lounge|chaise|modular|dining table|buffet|tv unit|sideboard|console|hall table|hallway|bookcase|shel(f|ves)|desk|cabinet|outdoor/],
  [4, 'Tables', /table|bedside/],
  [5, 'Seating', /chair|stool|ottoman|pouf|bench/],
  [6, 'Lamps', /lamp|light/],
  [7, 'Bedding & soft furnishings', /linen|bedding|cushion|throw|quilt|doona|pillow|towel|bath ?mat/],
  [8, 'Art & mirrors', /\bart\b|artwork|print|canvas|frame|mirror|wall/],
  [9, 'Styling & décor', /./],
]

export function installStep(item) {
  const text = [item.category, item.subcategory, item.name].filter(Boolean).join(' ').toLowerCase()
  // sub-group / category first so "Coffee tables" beats words in the description
  for (const src of [item.subcategory, item.category, text]) {
    const s = (src || '').toLowerCase()
    if (!s) continue
    for (const [n, label, re] of INSTALL_STEPS.slice(0, -1)) if (re.test(s)) return { n, label }
  }
  return { n: 9, label: 'Styling & décor' }
}
