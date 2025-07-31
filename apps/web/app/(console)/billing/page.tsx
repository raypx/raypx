"use client"

import { useSession } from "@raypx/auth/client"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card"
import { CreditCard, FileText, TrendingUp, Zap } from "lucide-react"
import { BillingHistory } from "./_components/billing-history"
import { CurrentPlan } from "./_components/current-plan"
import { PaymentMethods } from "./_components/payment-methods"
import { UsageMetrics } from "./_components/usage-metrics"

export default function BillingPage() {
  const { data: session } = useSession()

  if (!session?.user) {
    return null
  }

  return (
    <div className="container mx-auto max-w-6xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Billing & Usage</h1>
          <p className="text-muted-foreground mt-1">
            Manage your subscription, payment methods, and view usage statistics
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Current Plan */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Current Plan
              </CardTitle>
              <CardDescription>
                Your subscription details and plan information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CurrentPlan />
            </CardContent>
          </Card>
        </div>

        {/* Usage Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Usage This Month
            </CardTitle>
            <CardDescription>Current billing period usage</CardDescription>
          </CardHeader>
          <CardContent>
            <UsageMetrics />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Payment Methods */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Methods
            </CardTitle>
            <CardDescription>
              Manage your payment methods and billing information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentMethods />
          </CardContent>
        </Card>

        {/* Billing History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Billing History
            </CardTitle>
            <CardDescription>
              View and download your past invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BillingHistory />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
