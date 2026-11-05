import { useNavigate } from 'react-router-dom'
import Scanner from '../components/Scanner'

export default function FieldScan() {
  const nav = useNavigate()
  return <Scanner onClose={() => nav('/')} onCode={(code) => nav(`/i/${code}`, { replace: true })} />
}
