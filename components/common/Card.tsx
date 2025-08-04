"use client"

import type React from "react"

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

const Card: React.FC<CardProps> = ({ children, className = "", onClick }) => {
  const baseStyles = "bg-surface-card rounded-lg shadow-sm p-6"
  const interactiveStyles = onClick ? "cursor-pointer hover:shadow-md transition-shadow duration-200" : ""

  return (
    <div className={`${baseStyles} ${interactiveStyles} ${className}`} onClick={onClick}>
      {children}
    </div>
  )
}

// Export both as default and named export to support both import styles
export default Card
export { Card }
