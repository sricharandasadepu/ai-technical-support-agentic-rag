import * as Primitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export const TooltipProvider = Primitive.Provider
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          sideOffset={6}
          className="z-50 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-sm"
        >
          {text}
          <Primitive.Arrow className="fill-foreground" />
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}
