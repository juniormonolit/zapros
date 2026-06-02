import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full min-w-0 rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-input-text shadow-sm transition-[color,box-shadow,border-color] outline-none",
        "placeholder:text-input-placeholder hover:border-input-border-hover",
        "focus-visible:border-input-border-focus focus-visible:ring-3 focus-visible:ring-ring/40",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input-disabled-bg disabled:text-input-disabled-text disabled:opacity-50",
        "aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
