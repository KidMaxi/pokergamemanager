"use client"

import type React from "react"
import { useEffect } from "react"

interface BottomBannerProps {
  adSlot: string
  className?: string
}

const BottomBanner: React.FC<BottomBannerProps> = ({ adSlot, className = "" }) => {
  useEffect(() => {
    try {
      // @ts-ignore
      if (typeof window !== "undefined" && window.adsbygoogle) {
        // @ts-ignore
        ;(window.adsbygoogle = window.adsbygoogle || []).push({})
      }
    } catch (error) {
      console.error("AdSense error:", error)
    }
  }, [])

  return (
    <div className={`bottom-banner-ad ${className}`}>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client="ca-pub-9430547880013699"
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}

export default BottomBanner
