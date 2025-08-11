import type React from "react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost"
  size?: "sm" | "md" | "lg"
  children: React.ReactNode
}

const Button: React.FC<ButtonProps> = ({ children, variant = "primary", size = "md", className = "", ...props }) => {
  const baseStyles =
    "font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-main transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"

  let variantStyles = ""
  switch (variant) {
    case "primary":
      variantStyles = "bg-brand-primary text-white hover:bg-brand-primary-hover focus:ring-brand-primary"
      break
    case "secondary":
      variantStyles = "bg-brand-secondary text-white hover:bg-brand-secondary-hover focus:ring-brand-secondary"
      break
    case "danger":
      variantStyles = "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500"
      break
    case "ghost":
      variantStyles = "bg-transparent text-text-secondary hover:bg-slate-700 hover:text-white focus:ring-brand-primary"
      break
  }

  let sizeStyles = ""
  switch (size) {
    case "sm":
      sizeStyles = "px-3 py-1.5 text-sm"
      break
    case "md":
      sizeStyles = "px-4 py-2 text-base"
      break
    case "lg":
      sizeStyles = "px-6 py-3 text-lg"
      break
  }

  return (
    <button className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`} {...props}>
      {children}
    </button>
  )
}

export default Button
