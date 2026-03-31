import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'HealthNet-SL HMS',
  description: 'Smarter Health Management for Stronger Care',
  generator: 'HealthNet-SL HMS',
  icons: {
    icon: [
      {
        // Default favicon (used when no color-scheme preference is applied)
        url: '/healthnet-logo.png',
      },
      {
        // Light mode specific favicon
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        // Dark mode specific favicon
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
