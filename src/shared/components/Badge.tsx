interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'
  size?: 'sm' | 'md'
}

const variants = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
}

const sizes = {
  sm: 'text-[11px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
}

export default function Badge({ children, variant = 'default', size = 'sm' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${variants[variant]} ${sizes[size]}`}>
      {children}
    </span>
  )
}

// Convenience maps for domain-specific values
export function membershipBadgeVariant(status?: string): BadgeProps['variant'] {
  const map: Record<string, BadgeProps['variant']> = {
    member: 'success',
    regular_attender: 'info',
    visitor: 'warning',
    inactive: 'default',
  }
  return map[status ?? ''] ?? 'default'
}

export function flagBadgeVariant(type: string): BadgeProps['variant'] {
  const map: Record<string, BadgeProps['variant']> = {
    custody_alert: 'danger',
    behavioral: 'warning',
    medical: 'info',
    other: 'default',
  }
  return map[type] ?? 'default'
}
