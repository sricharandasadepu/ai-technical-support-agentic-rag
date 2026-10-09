import { cn } from '@/lib/utils'

const brandAssets = {
  logo: '/branding/nexadesk-logo.png',
  icon: '/branding/nexadesk-icon.png',
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border/60 bg-[#f8fafc] p-1',
        className,
      )}
    >
      <img
        src={brandAssets.icon}
        alt=""
        aria-hidden="true"
        width={544}
        height={544}
        className="block h-full w-full object-contain"
        draggable={false}
      />
    </span>
  )
}
export function Brand({
  compact = false,
  className,
  onDark = false,
}: {
  compact?: boolean
  className?: string
  onDark?: boolean
}) {
  return compact ? (
    <BrandMark className={className} />
  ) : (
    <span
      className={cn(
        'inline-flex w-[176px] max-w-full shrink-0 items-center rounded-lg dark:bg-[#f8fafc] dark:p-2',
        onDark && 'bg-[#f8fafc] p-2',
        className,
      )}
    >
      <img
        src={brandAssets.logo}
        alt="NexaDesk AI"
        width={1912}
        height={536}
        className="block h-auto w-full object-contain"
        draggable={false}
      />
    </span>
  )
}
