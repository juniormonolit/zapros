"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Avoid hydration mismatch: theme is only known on the client.
  React.useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === "dark"

  function toggleTheme() {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {mounted ? (
        isDark ? (
          <Sun aria-hidden="true" />
        ) : (
          <Moon aria-hidden="true" />
        )
      ) : (
        <Sun aria-hidden="true" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
