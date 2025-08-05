"use client"

import { CreditCard, FileText, TrendingUp, Zap } from "lucide-react"
import { ConsoleGrid, ConsolePage, ConsoleSection } from "@/layouts/console"
import { BillingHistory } from "./_components/billing-history"
import { CurrentPlan } from "./_components/current-plan"
import { PaymentMethods } from "./_components/payment-methods"
import { UsageMetrics } from "./_components/usage-metrics"

export default function BillingPage() {
  return (
    <ConsolePage
      title="Billing & Usage"
      description="Manage your subscription, payment methods, and view usage statistics"
      maxWidth="6xl"
    >
      <ConsoleGrid cols={1} lgCols={3}>
        <div className="lg:col-span-2">
          <ConsoleSection
            title="Current Plan"
            description="Your subscription details and plan information"
            icon={Zap}
          >
            <CurrentPlan />
          </ConsoleSection>
        </div>

        <ConsoleSection
          title="Usage This Month"
          description="Current billing period usage"
          icon={TrendingUp}
        >
          <UsageMetrics />
        </ConsoleSection>
      </ConsoleGrid>

      <ConsoleGrid cols={1} lgCols={2}>
        <ConsoleSection
          title="Payment Methods"
          description="Manage your payment methods and billing information"
          icon={CreditCard}
        >
          <PaymentMethods />
        </ConsoleSection>

        <ConsoleSection
          title="Billing History"
          description="View and download your past invoices"
          icon={FileText}
        >
          <BillingHistory />
        </ConsoleSection>
      </ConsoleGrid>
    </ConsolePage>
  )
}
