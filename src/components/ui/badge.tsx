import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] uppercase font-black tracking-tight transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2",
    {
        variants: {
            variant: {
                default:
                    "border-transparent bg-brand-500 text-black hover:bg-brand-400 shadow-lg shadow-brand-500/10",
                secondary:
                    "border-white/10 bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
                accent:
                    "border-transparent bg-accent-500 text-white hover:bg-accent-400 shadow-lg shadow-accent-500/10",
                destructive:
                    "border-transparent bg-red-500 text-white hover:bg-red-400 shadow-lg shadow-red-500/10",
                outline: "text-zinc-400 border-white/10 hover:border-white/20 hover:text-white",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
)

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props} />
    )
}

export { Badge, badgeVariants }
