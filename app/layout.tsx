import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { APP_BRAND_NAME, APP_TAGLINE } from "@/config/global"
import { getGlobalSettings } from "@/lib/global-settings"
import "./globals.css"

export const metadata: Metadata = {
  title: APP_BRAND_NAME,
  description: APP_TAGLINE,
  generator: APP_BRAND_NAME,
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const settings = await getGlobalSettings()

  return (
    <html lang={settings.language} suppressHydrationWarning dir={settings.language === "ar" ? "rtl" : "ltr"}>
      <body className={`font-sans antialiased`} suppressHydrationWarning>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
