import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useRef, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description
export function DialogContent({
  className,
  children,
  drawer = false,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { drawer?: boolean }) {
  const opener = useRef<HTMLElement | null>(null)
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[3px] data-[state=open]:animate-overlay" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 border border-border bg-surface shadow-2xl focus:outline-none',
          drawer
            ? 'inset-y-0 left-0 w-[290px] rounded-r-2xl'
            : 'left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 data-[state=open]:animate-dialog',
          className,
        )}
        onOpenAutoFocus={(event) => {
          opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null
          onOpenAutoFocus?.(event)
        }}
        onCloseAutoFocus={(event) => {
          if (onCloseAutoFocus) onCloseAutoFocus(event)
          else if (opener.current?.isConnected) {
            event.preventDefault()
            opener.current.focus()
          }
        }}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
