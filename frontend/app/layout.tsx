import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Aera AI - Procurement Assistant',
  description: 'AI-powered procurement assistant for streamlined RFP management and vendor evaluation',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
