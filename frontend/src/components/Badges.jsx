const STEP_TYPE_COLORS = {
  task: 'badge-blue',
  approval: 'badge-yellow',
  notification: 'badge-purple',
}

const STATUS_COLORS = {
  active: 'badge-green',
  inactive: 'badge-gray',
  pending: 'badge-gray',
  in_progress: 'badge-yellow',
  completed: 'badge-green',
  failed: 'badge-red',
  canceled: 'badge-gray',
  pending_approval: 'badge-yellow',
  rejected: 'badge-red',
}

export function StepTypeBadge({ type }) {
  return <span className={STEP_TYPE_COLORS[type] || 'badge-gray'}>{type}</span>
}

export function StatusBadge({ status }) {
  const label = status === 'in_progress' ? 'in progress' : status
  return <span className={STATUS_COLORS[status] || 'badge-gray'}>{label}</span>
}

export function ActiveBadge({ isActive }) {
  return isActive
    ? <span className="badge-green">Active</span>
    : <span className="badge-gray">Inactive</span>
}
