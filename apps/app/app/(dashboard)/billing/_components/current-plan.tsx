"use client"

import { Badge } from "@raypx/ui/components/badge"
import { Button } from "@raypx/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@raypx/ui/components/dialog"
import { Progress } from "@raypx/ui/components/progress"
import { toast } from "@raypx/ui/components/toast"
import { format } from "date-fns"
import { ArrowRight, Calendar, Check, Crown, Zap } from "lucide-react"
import { useEffect, useState } from "react"

interface Plan {
  id: string
  name: string
  price: number
  interval: "month" | "year"
  features: string[]
  limits: {
    requests: number
    storage: number
    bandwidth: number
  }
}

interface Subscription {
  id: string
  planId: string
  status: "active" | "canceled" | "past_due" | "unpaid"
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  usage: {
    requests: number
    storage: number
    bandwidth: number
  }
}

const AVAILABLE_PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    interval: "month",
    features: [
      "1,000 API requests/month",
      "1 GB storage",
      "Basic support",
      "Community access",
    ],
    limits: {
      requests: 1000,
      storage: 1073741824, // 1GB in bytes
      bandwidth: 10737418240, // 10GB in bytes
    },
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    interval: "month",
    features: [
      "50,000 API requests/month",
      "50 GB storage",
      "Priority support",
      "Advanced analytics",
      "Custom domains",
    ],
    limits: {
      requests: 50000,
      storage: 53687091200, // 50GB
      bandwidth: 536870912000, // 500GB
    },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 99,
    interval: "month",
    features: [
      "Unlimited API requests",
      "500 GB storage",
      "24/7 dedicated support",
      "White-label solution",
      "Custom integrations",
      "SLA guarantee",
    ],
    limits: {
      requests: -1, // unlimited
      storage: 536870912000, // 500GB
      bandwidth: -1, // unlimited
    },
  },
]

export function CurrentPlan() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [plans] = useState<Plan[]>(AVAILABLE_PLANS)
  const [loading, setLoading] = useState(true)
  const [upgradeLoading, setUpgradeLoading] = useState(false)

  useEffect(() => {
    fetchSubscription()
  }, [])

  const fetchSubscription = async () => {
    try {
      const response = await fetch("/api/billing/subscription")
      if (response.ok) {
        const data = await response.json()
        setSubscription(data.subscription)
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load subscription details",
      )
    } finally {
      setLoading(false)
    }
  }

  const handleUpgrade = async (planId: string) => {
    setUpgradeLoading(true)
    try {
      const response = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ planId }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl
        } else {
          await fetchSubscription()
          toast.success("Plan upgraded successfully")
        }
      } else {
        const error = await response.json()
        toast.error(error.message || "Failed to upgrade plan")
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      )
    } finally {
      setUpgradeLoading(false)
    }
  }

  const handleCancelSubscription = async () => {
    try {
      const response = await fetch("/api/billing/cancel", {
        method: "POST",
      })

      if (response.ok) {
        await fetchSubscription()
        toast.success(
          "Subscription will be canceled at the end of the billing period",
        )
      } else {
        toast.error("Failed to cancel subscription")
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      )
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  if (loading) {
    return <div>Loading subscription details...</div>
  }

  const currentPlan =
    plans.find((plan) => plan.id === subscription?.planId) || plans[0]
  const usage = subscription?.usage || { requests: 0, storage: 0, bandwidth: 0 }

  return (
    <div className="space-y-6">
      {/* Current Plan Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {currentPlan.id === "enterprise" && (
              <Crown className="h-5 w-5 text-yellow-500" />
            )}
            {currentPlan.id === "pro" && (
              <Zap className="h-5 w-5 text-blue-500" />
            )}
            <h3 className="text-2xl font-bold">{currentPlan.name}</h3>
          </div>
          <Badge
            variant={
              subscription?.status === "active" ? "default" : "secondary"
            }
          >
            {subscription?.status || "free"}
          </Badge>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">
            ${currentPlan.price}
            <span className="text-sm font-normal text-muted-foreground">
              /{currentPlan.interval}
            </span>
          </div>
        </div>
      </div>

      {/* Billing Period */}
      {subscription && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>
              Current period:{" "}
              {format(new Date(subscription.currentPeriodStart), "MMM dd")} -{" "}
              {format(new Date(subscription.currentPeriodEnd), "MMM dd, yyyy")}
            </span>
          </div>
          {subscription.cancelAtPeriodEnd && (
            <Badge variant="destructive">
              Canceling on{" "}
              {format(new Date(subscription.currentPeriodEnd), "MMM dd, yyyy")}
            </Badge>
          )}
        </div>
      )}

      {/* Usage Progress */}
      <div className="space-y-4">
        <h4 className="font-semibold">Usage This Month</h4>

        {/* API Requests */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>API Requests</span>
            <span>
              {formatNumber(usage.requests)} /{" "}
              {currentPlan.limits.requests === -1
                ? "∞"
                : formatNumber(currentPlan.limits.requests)}
            </span>
          </div>
          <Progress
            value={
              currentPlan.limits.requests === -1
                ? 0
                : (usage.requests / currentPlan.limits.requests) * 100
            }
            className="h-2"
          />
        </div>

        {/* Storage */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Storage</span>
            <span>
              {formatBytes(usage.storage)} /{" "}
              {formatBytes(currentPlan.limits.storage)}
            </span>
          </div>
          <Progress
            value={(usage.storage / currentPlan.limits.storage) * 100}
            className="h-2"
          />
        </div>

        {/* Bandwidth */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Bandwidth</span>
            <span>
              {formatBytes(usage.bandwidth)} /{" "}
              {currentPlan.limits.bandwidth === -1
                ? "∞"
                : formatBytes(currentPlan.limits.bandwidth)}
            </span>
          </div>
          <Progress
            value={
              currentPlan.limits.bandwidth === -1
                ? 0
                : (usage.bandwidth / currentPlan.limits.bandwidth) * 100
            }
            className="h-2"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {currentPlan.id !== "enterprise" && (
          <Dialog>
            <DialogTrigger asChild>
              <Button>
                <ArrowRight className="h-4 w-4 mr-2" />
                Upgrade Plan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Choose Your Plan</DialogTitle>
                <DialogDescription>
                  Select the plan that best fits your needs
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-3 mt-4">
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`p-6 border rounded-lg ${
                      plan.id === currentPlan.id
                        ? "border-primary bg-primary/5"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {plan.id === "enterprise" && (
                        <Crown className="h-5 w-5 text-yellow-500" />
                      )}
                      {plan.id === "pro" && (
                        <Zap className="h-5 w-5 text-blue-500" />
                      )}
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                    </div>
                    <div className="text-2xl font-bold mb-4">
                      ${plan.price}
                      <span className="text-sm font-normal text-muted-foreground">
                        /{plan.interval}
                      </span>
                    </div>
                    <ul className="space-y-2 mb-6">
                      {plan.features.map((feature, index) => (
                        <li
                          key={index}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    {plan.id === currentPlan.id ? (
                      <Button variant="outline" disabled className="w-full">
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleUpgrade(plan.id)}
                        disabled={upgradeLoading}
                        className="w-full"
                      >
                        {upgradeLoading
                          ? "Processing..."
                          : plan.id === "free"
                            ? "Downgrade"
                            : "Upgrade"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        )}

        {subscription &&
          subscription.status === "active" &&
          !subscription.cancelAtPeriodEnd && (
            <Button variant="outline" onClick={handleCancelSubscription}>
              Cancel Subscription
            </Button>
          )}
      </div>
    </div>
  )
}
