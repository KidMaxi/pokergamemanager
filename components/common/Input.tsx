"use client"

import type React from "react"

interface InputProps {
  type?: string
  placeholder?: string
  value?: string | number
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  className?: string
  disabled?: boolean
  required?: boolean
  label?: string
  error?: string
  id?: string
  name?: string
  min?: string | number
  max?: string | number
  step?: string | number
}

const Input: React.FC<InputProps> = ({
  type = "text",
  placeholder,
  value,
  onChange,
  className = "",
  disabled = false,
  required = false,
  label,
  error,
  id,
  name,
  min,
  max,
  step,
}) => {
  const inputId = id || name || placeholder?.toLowerCase().replace(/\s+/g, "-")

  return (
    <div className="w-full space-y-2">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-text-primary mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <input
        type={type}
        id={inputId}
        name={name}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        min={min}
        max={max}
        step={step}
        className={`
          w-full px-4 py-3 rounded-lg sm:rounded-xl
          bg-surface-input text-text-primary border border-border-default
          placeholder-text-secondary
          focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent
          hover:border-brand-primary
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200
          text-base leading-relaxed
          ${error ? "ring-2 ring-red-500 border-red-500" : ""}
          ${className}
        `}
      />
      {error && <p className="mt-2 text-sm text-red-500 px-1">{error}</p>}
    </div>
  )
}

export default Input
