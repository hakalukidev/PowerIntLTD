import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils/index"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/20 hover:from-emerald-600 hover:to-emerald-500 dark:from-emerald-500 dark:to-teal-500",
        destructive:
          "bg-gradient-to-r from-rose-600 to-red-500 text-white shadow-md shadow-rose-500/20 hover:from-rose-700 hover:to-rose-500",
        success:
          "bg-gradient-to-r from-green-600 to-emerald-500 text-white shadow-md shadow-green-500/20 hover:from-green-700 hover:to-emerald-600",
        warning:
          "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/20 hover:from-amber-600 hover:to-orange-600",
        info:
          "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20 hover:from-sky-600 hover:to-blue-700",
        outline:
          "border border-input bg-background shadow-sm hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-sky-500/10 text-sky-700 shadow-sm hover:bg-sky-500/20 dark:text-sky-300",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
