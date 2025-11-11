import { CheckCircle, Clock, XCircle, FileText } from 'lucide-react'

type Status = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'

export function StatusBadge({ status }: { status: Status }) {
  const { bg, text, border, Icon, label } = mapStatus(status)
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs ${bg} ${text} ${border}`}>
      <Icon className="h-4 w-4" aria-hidden={true} />
      {label}
    </span>
  )
}

function mapStatus(status: Status) {
  switch (status) {
    case 'paid':
      return { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200', Icon: CheckCircle, label: 'Paid' }
    case 'open':
      return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200', Icon: Clock, label: 'Open' }
    case 'void':
    case 'uncollectible':
      return { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200', Icon: XCircle, label: capitalize(status) }
    case 'draft':
    default:
      return { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200', Icon: FileText, label: 'Draft' }
  }
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default StatusBadge
