import { useState, useEffect, useCallback } from 'react'
import { Crown, Check, CircleCheck } from 'lucide-react'
import type { BillingPlan, Entitlement } from '../../../preload'

// ========== Wave Background SVG ==========

function WaveBackground(): React.JSX.Element {
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 288 186"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      style={{ opacity: 0.2 }}
    >
      <defs>
        <linearGradient
          id="waveGradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
          gradientTransform="rotate(-107 0.5 0.5)"
        >
          <stop offset="0%" stopColor="#f7c193" stopOpacity="0.05" />
          <stop offset="67%" stopColor="#007aff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#007aff" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {/* Multiple wave layers for depth effect */}
      <path
        d="M-50 140 Q30 100, 100 130 T220 110 T340 140 L340 200 L-50 200 Z"
        fill="url(#waveGradient)"
      />
      <path
        d="M-50 155 Q40 125, 120 150 T240 130 T340 160 L340 200 L-50 200 Z"
        fill="url(#waveGradient)"
        opacity="0.7"
      />
      <path
        d="M-50 170 Q50 145, 140 165 T260 150 T340 175 L340 200 L-50 200 Z"
        fill="url(#waveGradient)"
        opacity="0.5"
      />
      <path
        d="M-50 180 Q60 160, 160 175 T280 165 T340 185 L340 200 L-50 200 Z"
        fill="url(#waveGradient)"
        opacity="0.3"
      />
    </svg>
  )
}

// ========== Lifetime Plan Card ==========

interface LifetimeCardProps {
  onSelect: () => void
  disabled?: boolean
  isCurrent?: boolean
}

function LifetimeCard({ onSelect, disabled = false, isCurrent = false }: LifetimeCardProps): React.JSX.Element {
  const features = ['Edit task status', 'Edit task name', 'Edit task time/date', 'All future updates']

  return (
    <div className="relative overflow-hidden rounded-[10px] bg-white border-[1.5px] border-[#007AFF]">
      {/* Wave Background */}
      <WaveBackground />

      {/* Content */}
      <div className="relative z-10 flex flex-col gap-2.5 p-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col" style={{ gap: '4px' }}>
            {/* Title with Crown icon */}
            <div className="flex items-center" style={{ gap: '6px' }}>
              <Crown className="h-4 w-4 shrink-0 text-[#007AFF]" />
              <span className="text-sm font-semibold text-foreground">Lifetime</span>
            </div>
            <span className="text-[11px] text-muted-foreground">One-time payment, forever access</span>
          </div>
          <div className="flex items-baseline" style={{ gap: '2px' }}>
            <span className="text-sm font-semibold text-[#007AFF]">$</span>
            <span className="text-xl font-bold text-[#007AFF]">49.9</span>
          </div>
        </div>

        {/* Features */}
        <div className="flex flex-col" style={{ gap: '6px' }}>
          {features.map((feature, index) => (
            <div key={index} className="flex items-center" style={{ gap: '6px' }}>
              <Check className="h-3 w-3 shrink-0 text-[#22c55e]" />
              <span className="text-xs text-foreground">{feature}</span>
            </div>
          ))}
        </div>

        {/* Button */}
        <button
          onClick={onSelect}
          disabled={disabled || isCurrent}
          className={`w-full h-8 rounded-md text-xs font-semibold transition-colors ${
            isCurrent
              ? 'bg-[#22c55e15] text-[#22c55e] cursor-default'
              : 'btn-shine bg-[#007AFF] text-white hover:bg-[#0066DD]'
          } ${disabled && !isCurrent ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isCurrent ? '✓ Current Plan' : 'Upgrade to Lifetime'}
        </button>
      </div>
    </div>
  )
}

// ========== Monthly Plan Card ==========

interface MonthlyCardProps {
  onSelect: () => void
  disabled?: boolean
  isCurrent?: boolean
}

function MonthlyCard({ onSelect, disabled = false, isCurrent = false }: MonthlyCardProps): React.JSX.Element {
  const features = ['Edit task status', 'Edit task name', 'Edit task time/date']

  return (
    <div className="flex flex-col gap-2.5 p-3 rounded-[10px] bg-white border border-border">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col" style={{ gap: '4px' }}>
          <span className="text-sm font-semibold text-foreground">Monthly</span>
          <span className="text-[11px] text-muted-foreground">Billed monthly, cancel anytime</span>
        </div>
        <div className="flex items-baseline" style={{ gap: '2px' }}>
          <span className="text-sm font-semibold text-foreground">$</span>
          <span className="text-xl font-bold text-foreground">9.9</span>
          <span className="text-xs text-muted-foreground">/mo</span>
        </div>
      </div>

      {/* Features */}
      <div className="flex flex-col" style={{ gap: '6px' }}>
        {features.map((feature, index) => (
          <div key={index} className="flex items-center" style={{ gap: '6px' }}>
            <Check className="h-3 w-3 shrink-0 text-[#22c55e]" />
            <span className="text-xs text-foreground">{feature}</span>
          </div>
        ))}
      </div>

      {/* Button */}
      <button
        onClick={onSelect}
        disabled={disabled || isCurrent}
        className={`w-full h-8 rounded-md text-xs font-semibold transition-colors ${
          isCurrent
            ? 'bg-[#22c55e15] text-[#22c55e] cursor-default'
            : 'bg-secondary text-foreground hover:bg-secondary/80'
        } ${disabled && !isCurrent ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isCurrent ? '✓ Current Plan' : 'Subscribe Monthly'}
      </button>
    </div>
  )
}

// ========== Current Plan Badge ==========

interface CurrentPlanBadgeProps {
  plan: BillingPlan
  expiresAt: string | null
}

function CurrentPlanBadge({ plan, expiresAt }: CurrentPlanBadgeProps): React.JSX.Element {
  const isPaid = plan === 'lifetime' || plan === 'monthly'
  const isExpired = plan === 'monthly' && expiresAt && new Date(expiresAt) < new Date()
  const isFree = plan === 'free' || isExpired

  const getPlanDisplayName = (): string => {
    if (plan === 'lifetime') return 'Lifetime'
    if (plan === 'monthly') return isExpired ? 'Monthly (Expired)' : 'Monthly'
    return 'Free'
  }

  const freeFeatures = [
    'View pinned task list',
    'Refresh & auto-sync',
    'Filter tabs (All/Todo/In Progress/Done)'
  ]

  return (
    <div className="flex flex-col rounded-lg bg-[#f5f5f5] p-3" style={{ gap: '10px' }}>
      {/* Header - Horizontal layout: Plan name + "Your Current Plan" */}
      <div className="flex items-center" style={{ gap: '8px' }}>
        <span className="text-[13px] font-semibold text-foreground">{getPlanDisplayName()}</span>
        <span className="text-[11px] font-medium text-[#737373]">Your Current Plan</span>
      </div>

      {/* Free Features - show when free or expired */}
      {isFree && (
        <div className="flex flex-col" style={{ gap: '8px' }}>
          <div className="flex flex-col" style={{ gap: '4px' }}>
            {freeFeatures.map((feature, index) => (
              <div key={index} className="flex items-center" style={{ gap: '6px' }}>
                <Check className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Paid plan info */}
      {isPaid && !isExpired && plan === 'monthly' && expiresAt && (
        <span className="text-[10px] text-muted-foreground">
          Expires: {new Date(expiresAt).toLocaleDateString()}
        </span>
      )}
    </div>
  )
}

// ========== Dev Mode Buttons ==========

interface DevModeButtonsProps {
  onSimulateLifetime: () => void
  onSimulateMonthly: () => void
  onReset: () => void
  isLoading: boolean
}

function DevModeButtons({
  onSimulateLifetime,
  onSimulateMonthly,
  onReset,
  isLoading
}: DevModeButtonsProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5">
      <span className="text-[10px] font-semibold text-amber-600 uppercase">
        🧪 Dev Mode
      </span>
      <div className="flex flex-col gap-1.5">
        <button
          onClick={onSimulateLifetime}
          disabled={isLoading}
          className="w-full h-7 rounded text-[10px] font-medium bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 disabled:opacity-50"
        >
          Simulate Lifetime Purchase
        </button>
        <button
          onClick={onSimulateMonthly}
          disabled={isLoading}
          className="w-full h-7 rounded text-[10px] font-medium bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 disabled:opacity-50"
        >
          Simulate Monthly (30 days)
        </button>
        <button
          onClick={onReset}
          disabled={isLoading}
          className="w-full h-7 rounded text-[10px] font-medium bg-red-500/10 text-red-600 hover:bg-red-500/20 disabled:opacity-50"
        >
          Reset to Free
        </button>
      </div>
    </div>
  )
}

// ========== Main Component ==========

interface BillingTabProps {
  onPlanChanged?: () => void
}

export function BillingTab({ onPlanChanged }: BillingTabProps): React.JSX.Element {
  const [entitlement, setEntitlement] = useState<Entitlement>({
    plan: 'free',
    purchasedAt: null,
    expiresAt: null
  })
  const [isLoading, setIsLoading] = useState(true)

  // 加载当前订阅状态
  useEffect(() => {
    const loadEntitlement = async (): Promise<void> => {
      try {
        const result = await window.billingAPI.getEntitlement()
        setEntitlement(result)
      } catch (error) {
        console.error('Failed to load entitlement:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadEntitlement()
  }, [])

  // 模拟 Lifetime 购买
  const handleSimulateLifetime = useCallback(async () => {
    setIsLoading(true)
    try {
      const newEntitlement: Entitlement = {
        plan: 'lifetime',
        purchasedAt: new Date().toISOString(),
        expiresAt: null
      }
      await window.billingAPI.setEntitlement(newEntitlement)
      setEntitlement(newEntitlement)
      onPlanChanged?.()
    } catch (error) {
      console.error('Failed to simulate lifetime purchase:', error)
    } finally {
      setIsLoading(false)
    }
  }, [onPlanChanged])

  // 模拟 Monthly 购买
  const handleSimulateMonthly = useCallback(async () => {
    setIsLoading(true)
    try {
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 30)
      const newEntitlement: Entitlement = {
        plan: 'monthly',
        purchasedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString()
      }
      await window.billingAPI.setEntitlement(newEntitlement)
      setEntitlement(newEntitlement)
      onPlanChanged?.()
    } catch (error) {
      console.error('Failed to simulate monthly purchase:', error)
    } finally {
      setIsLoading(false)
    }
  }, [onPlanChanged])

  // 重置为免费
  const handleReset = useCallback(async () => {
    setIsLoading(true)
    try {
      await window.billingAPI.resetEntitlement()
      setEntitlement({
        plan: 'free',
        purchasedAt: null,
        expiresAt: null
      })
      onPlanChanged?.()
    } catch (error) {
      console.error('Failed to reset entitlement:', error)
    } finally {
      setIsLoading(false)
    }
  }, [onPlanChanged])

  const isLifetime = entitlement.plan === 'lifetime'
  const isMonthly = entitlement.plan === 'monthly'
  const isMonthlyExpired = isMonthly && entitlement.expiresAt && new Date(entitlement.expiresAt) < new Date()

  return (
    <div className="flex flex-col" style={{ gap: '16px' }}>
      {/* Current Plan Section */}
      <CurrentPlanBadge plan={entitlement.plan} expiresAt={entitlement.expiresAt} />

      {/* Plans Section */}
      <div className="flex flex-col" style={{ gap: '12px' }}>
        <span className="text-[13px] font-semibold text-foreground">
          {isLifetime ? 'Your Plan' : 'Upgrade Your Plan'}
        </span>

        {/* Lifetime Card */}
        <LifetimeCard
          onSelect={handleSimulateLifetime}
          disabled={isLoading}
          isCurrent={isLifetime}
        />

        {/* Monthly Card */}
        <MonthlyCard
          onSelect={handleSimulateMonthly}
          disabled={isLoading || isLifetime}
          isCurrent={isMonthly && !isMonthlyExpired}
        />
      </div>

      {/* 付费用户可随时降级到 Free plan */}
      {(isLifetime || isMonthly) && (
        <button
          onClick={handleReset}
          disabled={isLoading}
          className="w-full h-8 rounded-md text-xs font-medium border border-dashed border-muted-foreground/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors disabled:opacity-50"
        >
          Switch to Free plan
        </button>
      )}

      {/* Dev Mode - 仅在开发模式显示 */}
      {import.meta.env.DEV && (
        <DevModeButtons
          onSimulateLifetime={handleSimulateLifetime}
          onSimulateMonthly={handleSimulateMonthly}
          onReset={handleReset}
          isLoading={isLoading}
        />
      )}
    </div>
  )
}
