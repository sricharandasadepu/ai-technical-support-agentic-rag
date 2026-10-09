import * as Primitive from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const DropdownMenu = Primitive.Root
export const DropdownMenuTrigger = Primitive.Trigger
export const DropdownMenuLabel = Primitive.Label
export const DropdownMenuRadioGroup = Primitive.RadioGroup
export function DropdownMenuContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={8}
        className={cn(
          'z-50 min-w-56 rounded-xl border border-border bg-surface p-1.5 shadow-lg',
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  )
}
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  )
}
export function DropdownMenuSeparator() {
  return <Primitive.Separator className="my-1.5 h-px bg-border" />
}
export function DropdownMenuRadioItem({
  children,
  ...props
}: ComponentProps<typeof Primitive.RadioItem>) {
  return (
    <Primitive.RadioItem
      className="relative cursor-pointer rounded-md py-2 pl-8 pr-3 text-sm outline-none focus:bg-accent"
      {...props}
    >
      <Primitive.ItemIndicator className="absolute left-2.5 top-2.5">
        <Check className="size-3.5" />
      </Primitive.ItemIndicator>
      {children}
    </Primitive.RadioItem>
  )
}
