import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Styled native `<select>`. A plain native control is used (instead of a
 * popover-based widget) so it works inside server-rendered forms and submits
 * through `FormData` without extra client wiring.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-lg border border-input-border bg-input-bg px-3 py-1 text-sm text-input-text shadow-sm transition-[color,box-shadow,border-color] outline-none",
        "hover:border-input-border-hover",
        "focus-visible:border-input-border-focus focus-visible:ring-3 focus-visible:ring-ring/40",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input-disabled-bg disabled:text-input-disabled-text disabled:opacity-50",
        "aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20",
        className,
      )}
      {...props}
    />
  )
}

export { Select }
