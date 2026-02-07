import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-bold ring-offset-zinc-950 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95",
    {
        variants: {
            variant: {
                default: "bg-brand-500 text-black hover:bg-brand-400 shadow-lg shadow-brand-500/20",
                accent: "bg-accent-500 text-white hover:bg-accent-400 shadow-lg shadow-accent-500/20",
                destructive: "bg-red-500 text-white hover:bg-red-400 shadow-lg shadow-red-500/20",
                outline: "border border-white/10 bg-transparent hover:bg-white/5 text-zinc-300 hover:text-white",
                secondary: "bg-zinc-800 text-white hover:bg-zinc-700 border border-white/5",
                ghost: "hover:bg-white/5 hover:text-white",
                link: "text-brand-400 underline-offset-4 hover:underline",
            },
            size: {
                default: "h-11 px-6",
                sm: "h-9 rounded-lg px-4 text-xs",
                lg: "h-14 rounded-2xl px-10 text-base",
                icon: "h-11 w-11",
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
