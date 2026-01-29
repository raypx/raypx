"use client";

import { CheckIcon, CreditCardIcon, DownloadIcon } from "@phosphor-icons/react";
import { Badge } from "@raypx/ui/components/badge";
import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import { Progress } from "@raypx/ui/components/progress";

const plans = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["Up to 3 team members", "Basic analytics", "1GB storage"],
    current: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    period: "/month",
    features: ["Up to 10 team members", "Advanced analytics", "10GB storage", "Priority support"],
    current: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "$99",
    period: "/month",
    features: [
      "Unlimited team members",
      "Enterprise analytics",
      "Unlimited storage",
      "24/7 support",
      "Custom integrations",
    ],
    current: false,
  },
];

const invoices = [
  { id: "1", date: "Dec 1, 2025", amount: "$29.00", status: "paid" },
  { id: "2", date: "Nov 1, 2025", amount: "$29.00", status: "paid" },
  { id: "3", date: "Oct 1, 2025", amount: "$29.00", status: "paid" },
];

export default function BillingSettingsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>You are currently on the Pro plan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-2xl">Pro Plan</p>
              <p className="text-muted-foreground text-sm">$29/month • Renews on Jan 1, 2026</p>
            </div>
            <Button variant="outline">Manage Subscription</Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Team Members</span>
              <span>5 / 10</span>
            </div>
            <Progress value={50} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Storage</span>
              <span>3.2 GB / 10 GB</span>
            </div>
            <Progress value={32} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available Plans</CardTitle>
          <CardDescription>Choose the plan that best fits your needs.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <div
                className={`rounded-lg border p-4 ${
                  plan.current ? "border-primary bg-primary/5" : ""
                }`}
                key={plan.id}
              >
                <div className="mb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{plan.name}</h3>
                    {plan.current && <Badge>Current</Badge>}
                  </div>
                  <div className="mt-2">
                    <span className="font-bold text-2xl">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  </div>
                </div>
                <ul className="mb-4 space-y-2">
                  {plan.features.map((feature) => (
                    <li className="flex items-center gap-2 text-sm" key={feature}>
                      <CheckIcon className="size-4 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  disabled={plan.current}
                  variant={plan.current ? "outline" : "default"}
                >
                  {plan.current ? "Current Plan" : "Upgrade"}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
          <CardDescription>Manage your payment methods.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-4">
              <div className="flex size-10 items-center justify-center rounded-md bg-muted">
                <CreditCardIcon className="size-5" />
              </div>
              <div>
                <p className="font-medium text-sm">•••• •••• •••• 4242</p>
                <p className="text-muted-foreground text-xs">Expires 12/2025</p>
              </div>
            </div>
            <Button size="sm" variant="outline">
              Update
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>Download your past invoices.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {invoices.map((invoice) => (
              <div
                className="flex items-center justify-between rounded-lg border p-4"
                key={invoice.id}
              >
                <div>
                  <p className="font-medium text-sm">{invoice.date}</p>
                  <p className="text-muted-foreground text-xs">{invoice.amount}</p>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant="secondary">{invoice.status}</Badge>
                  <Button size="sm" variant="ghost">
                    <DownloadIcon className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
