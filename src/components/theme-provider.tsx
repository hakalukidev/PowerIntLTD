"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// next-themes injects an inline <script> to set the theme before hydration
// (avoiding a flash of the wrong theme). React 19 + Next.js 16.2+ log a dev-only
// false-positive warning about this pattern; it is harmless and next-themes has
// not been updated to address it. Filter just this one message in development.
if (process.env.NODE_ENV === "development") {
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Encountered a script tag")) {
      return
    }
    originalError(...args)
  }
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
