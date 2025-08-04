"use client"

import type React from "react"

interface InputProps {
  type?: string
  placeholder?: string
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  className?: string
  disabled?: boolean
  required?: boolean
  label?: string
  error?: string
  id?: string
  name?: string
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
}) => {
  const inputId = id || name || placeholder?.toLowerCase().replace(/\s+/g, "-")

  return (
    <div className="w-full">
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
        className={`
          w-full px-4 py-3 rounded-lg
          bg-surface-input text-text-primary
          placeholder-text-secondary
          focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-opacity-50
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-200
          ${error ? "ring-2 ring-red-500" : ""}
          ${className}
        `}
      />
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  )
}

export default Input
