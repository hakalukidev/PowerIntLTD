import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { ERPProvider } from '@/lib/erp/provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Muaz Technology | ERP System',
  description: 'Enterprise Resource Planning System',
  icons: {
    icon: '/muaz_icon.png',
    shortcut: '/muaz_icon.png',
    apple: '/muaz_icon.png',
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
