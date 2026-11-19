import Icon from './Icon'

/** Google Maps link for a house. Opens the Maps app on phones that have it. */
export function mapsUrl(job) {
  const parts = [job.property_address, job.suburb].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${parts}, NSW, Australia`)}`
}

export default function MapLink({ job, label = 'Directions', className = 'btn btn-small', stop = false }) {
  if (!job?.property_address) return null
  return (
    <a className={`map-link ${className}`} href={mapsUrl(job)} target="_blank" rel="noreferrer"
      onClick={stop ? (e) => e.stopPropagation() : undefined} aria-label={`Open ${job.property_address} in Google Maps`}>
      <Icon name="pin" size={16} /> {label}
    </a>
  )
}
