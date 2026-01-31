import { useState } from 'react'
import { AppModal } from '@/components/ui/app-modal'
import { BillingTab } from './BillingTab'

interface BillingPopoverProps {
  trigger: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onPlanChanged?: () => void
}

export function BillingPopover({
  trigger,
  open: controlledOpen,
  onOpenChange,
  onPlanChanged
}: BillingPopoverProps): React.JSX.Element {
  const [internalOpen, setInternalOpen] = useState(false)

  // 支持受控和非受控模式
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setIsOpen = (open: boolean): void => {
    if (onOpenChange) {
      onOpenChange(open)
    } else {
      setInternalOpen(open)
    }
  }

  const handleClose = (): void => {
    setIsOpen(false)
  }

  return (
    <>
      {/* Trigger */}
      <div onClick={() => setIsOpen(true)}>{trigger}</div>

      {/* Modal - 复用 AppModal 外壳，与 SettingsModal 100% 一致 */}
      <AppModal
        isOpen={isOpen}
        onClose={handleClose}
        title="Upgrade to Pro"
        className="w-[320px]"
        maxContentHeight="65vh"
      >
        <div className="p-4">
          <BillingTab onPlanChanged={onPlanChanged} />
        </div>
      </AppModal>
    </>
  )
}
