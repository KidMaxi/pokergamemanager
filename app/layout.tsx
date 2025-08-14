import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "../contexts/AuthContext"
import Navbar from "../components/Navbar"
import PWAInstall from "../components/PWAInstall"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Poker Home Game Manager",
  description: "Track your poker games, manage players, and settle up with ease",
  manifest: "/manifest.json",
  themeColor: "#1f2937",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
    generator: 'v0.app'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <Navbar />
          {children}
          <PWAInstall />
          <footer className="bg-slate-900 text-center p-4 text-sm text-slate-500 border-t border-slate-700">
            Poker Homegame Manager V52 &copy; {new Date().getFullYear()}
          </footer>
        </AuthProvider>
      </body>
    </html>
  )
}
