import React from 'react'

interface CardProps {
  children: React.ReactNode
  title?: string
  className?: string
  action?: React.ReactNode
}

export default function Card({ children, title, className = '', action }: CardProps) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
          {action}
        </div>
      )}
      <div>{children}</div>
    </div>
  )
}
