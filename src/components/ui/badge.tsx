import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        accent:
          "border-info-border bg-info-bg text-info",
        success:
          "border-success-border bg-success-bg text-success",
        warning:
          "border-warning-border bg-warning-bg text-warning",
        danger:
          "border-danger-border bg-danger-bg text-danger",
        muted:
          "border-border-primary bg-bg-secondary text-text-secondary",
      },
    },
    defaultVariants: {
      variant: "muted",
    },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
