import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { ERPProvider } from '@/lib/erp/provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Power International BD | ERP System',
  description: 'Enterprise Resource Planning System',
  icons: {
    icon: '/power-icon.png',
    shortcut: '/power-icon.png',
    apple: '/power-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <ERPProvider>{children}</ERPProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
