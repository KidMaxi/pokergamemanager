"use client"

import type React from "react"

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  title?: string
}

const Card: React.FC<CardProps> = ({ children, className = "", onClick, title }) => {
  const baseStyles = "bg-surface-card shadow-sm transition-all duration-200 rounded-lg sm:rounded-xl"
  const paddingStyles = "p-4 sm:p-6"
  const interactiveStyles = onClick ? "cursor-pointer hover:shadow-md hover:scale-[1.01] transform" : ""

  return (
    <div className={`${baseStyles} ${paddingStyles} ${interactiveStyles} ${className}`} onClick={onClick}>
      {title && (
        <div className="mb-4 pb-3 border-b border-border-default">
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        </div>
      )}
      <div className="space-y-3">
        {children}
      </div>
    </div>
  )
}

export default Card
export { Card }
