import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Sans_Bengali } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { ERPProvider } from '@/lib/erp/provider'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
// Dealer names, notes, and addresses are often typed in Bangla.
const notoBengali = Noto_Sans_Bengali({ subsets: ['bengali'], variable: '--font-bengali', display: 'swap' })

export const metadata: Metadata = {
  title: 'Power International BD | ERP System',
  description: 'Enterprise Resource Planning System',
  icons: {
    icon: '/power-icon.png',
    shortcut: '/power-icon.png',
    apple: '/power-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1117' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${notoBengali.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <ERPProvider>{children}</ERPProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
