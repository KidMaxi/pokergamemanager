import type React from "react"

interface CardProps {
  children: React.ReactNode
  className?: string
  title?: string
}

const Card: React.FC<CardProps> = ({ children, className = "", title }) => {
  return (
    <div className={`bg-surface-card shadow-lg rounded-lg p-6 ${className}`}>
      {title && <h3 className="text-lg font-semibold text-text-primary mb-4">{title}</h3>}
      {children}
    </div>
  )
}

export default Card
