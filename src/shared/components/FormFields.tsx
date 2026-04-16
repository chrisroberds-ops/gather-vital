import React from 'react'

interface FieldProps {
  label: string
  error?: string
  required?: boolean
  hint?: string
}

interface InputProps extends FieldProps, React.InputHTMLAttributes<HTMLInputElement> {}
interface SelectProps extends FieldProps, React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode
}
interface TextareaProps extends FieldProps, React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const baseInput = `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors`
const normalBorder = 'border-gray-300'
const errorBorder = 'border-red-400 bg-red-50'

export function Input({ label, error, required, hint, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        className={`${baseInput} ${error ? errorBorder : normalBorder} ${className}`}
        {...props}
      />
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function Select({ label, error, required, hint, children, className = '', ...props }: SelectProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <select
        className={`${baseInput} ${error ? errorBorder : normalBorder} ${className}`}
        {...props}
      >
        {children}
      </select>
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function Textarea({ label, error, required, hint, className = '', ...props }: TextareaProps) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <textarea
        className={`${baseInput} ${error ? errorBorder : normalBorder} resize-none ${className}`}
        rows={3}
        {...props}
      />
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
