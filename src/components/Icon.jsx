// One set of thin line icons for the whole app (no emoji or text symbols,
// which phones can swap for colourful emoji). They inherit the text colour.
const P = {
  dashboard: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="4.5" rx="1.5" /><rect x="13" y="10.5" width="7" height="9.5" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /></>,
  stock: <path d="M4 8l8-4 8 4-8 4-8-4zm0 0v8l8 4 8-4V8M12 12v8" />,
  house: <path d="M4 11l8-7 8 7M6 10v10h12V10M10 20v-5h4v5" />,
  calendar: <path d="M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />,
  import: <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />,
  team: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" /><circle cx="16.5" cy="9.5" r="2.4" /><path d="M15.5 14.4c2.4-.3 4.4 1.2 5 4.1" /></>,
  scan: <><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><path d="M8 12h8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  jobs: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /><path d="M4 7l8 6 8-6" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  down: <path d="M6 9l6 6 6-6" />,
  up: <path d="M6 15l6-6 6 6" />,
  key: <><circle cx="8" cy="15" r="3.5" /><path d="M10.5 12.5L19 4M16 7l2.5 2.5M14 9l2 2" /></>,
  clip: <path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.1-8.1a3.4 3.4 0 0 1 4.8 4.8l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>,
  list: <path d="M4 6h16M4 12h16M4 18h16" />,
  image: <><rect x="4" y="5" width="16" height="14" rx="1.5" /><circle cx="9" cy="10" r="1.6" /><path d="M20 16l-5-5-8 8" /></>,
  money: <path d="M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v4M18 10v4" />,
  bag: <path d="M5 7h14l-1.4 11.2a1.5 1.5 0 0 1-1.5 1.3H7.9a1.5 1.5 0 0 1-1.5-1.3L5 7zM9 7V6a3 3 0 0 1 6 0v1" />,
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0" />,
}

export default function Icon({ name, size = 20, stroke = 1.6, className = '', label }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" className={`icon ${className}`}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {P[name]}
    </svg>
  )
}
