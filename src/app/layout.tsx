import type { Metadata, Viewport } from 'next'
import { ServiceWorkerRegistration } from '@/components/layout/service-worker'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Shan Village — Operations Management',
    template: '%s · Shan Village',
  },
  description: 'Staff and duty roster management for Shan Village Restaurant.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Shan Village', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#a63722',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
