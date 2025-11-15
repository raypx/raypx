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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@raypx/ui/components/table";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  Clock,
  CreditCard,
  Crown,
  Database,
  Download,
  Rocket,
  Users,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/_org/org/$orgSlug/billing/")({
  component: BillingPage,
});

const plans = [
  {
    name: "Starter",
    price: "$0",
    period: "forever",
    description: "Perfect for trying out",
    features: ["Up to 5 team members", "10 GB storage", "Basic support", "API access"],
    icon: Zap,
    color: "text-blue-500",
    current: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "per month",
    description: "For growing teams",
    features: [
      "Up to 20 team members",
      "100 GB storage",
      "Priority support",
      "Advanced API access",
      "Custom integrations",
    ],
    icon: Rocket,
    color: "text-purple-500",
    current: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "contact us",
    description: "For large organizations",
    features: [
      "Unlimited team members",
      "Unlimited storage",
      "24/7 dedicated support",
      "Enterprise API access",
      "Custom integrations",
      "SLA guarantee",
      "On-premise deployment",
    ],
    icon: Crown,
    color: "text-yellow-500",
    current: false,
  },
];

const invoices = [
  {
    id: "INV-2025-001",
    date: "2025-01-01",
    amount: "$29.00",
    status: "Paid",
    pdf: "/invoices/2025-001.pdf",
  },
  {
    id: "INV-2024-012",
    date: "2024-12-01",
    amount: "$29.00",
    status: "Paid",
    pdf: "/invoices/2024-012.pdf",
  },
  {
    id: "INV-2024-011",
    date: "2024-11-01",
    amount: "$29.00",
    status: "Paid",
    pdf: "/invoices/2024-011.pdf",
  },
];

function BillingPage() {
  // TODO: Add org membership check here
  // For now, auth is handled by parent _org layout
  // const { orgSlug } = Route.useParams();

  const currentPlan = plans.find((p) => p.current);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing & Subscription</h1>
        <p className="text-muted-foreground">Manage your organization's subscription and billing</p>
      </div>

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>You are currently on the {currentPlan?.name} plan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-6 border rounded-lg bg-muted/50">
            <div className="flex items-center gap-4">
              {currentPlan?.icon && (
                <div className={`p-3 rounded-lg bg-background ${currentPlan.color}`}>
                  <currentPlan.icon className="h-6 w-6" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-2xl font-bold">{currentPlan?.name}</h3>
                  <Badge>Current Plan</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {currentPlan?.price} {currentPlan?.period}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Next billing date: February 1, 2025
                </p>
              </div>
            </div>
            <Button variant="outline">Change Plan</Button>
          </div>

          {/* Usage Stats */}
          <div className="space-y-4">
            <h4 className="font-medium">Plan Usage</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>Team Members</span>
                  </div>
                  <span className="text-muted-foreground">8 of 20</span>
                </div>
                <Progress value={40} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    <span>Storage</span>
                  </div>
                  <span className="text-muted-foreground">45 GB of 100 GB</span>
                </div>
                <Progress value={45} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>API Calls</span>
                  </div>
                  <span className="text-muted-foreground">125k of 1M</span>
                </div>
                <Progress value={12.5} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Available Plans</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <Card className={plan.current ? "border-primary" : ""} key={plan.name}>
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <plan.icon className={`h-5 w-5 ${plan.color}`} />
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.current && <Badge variant="default">Current</Badge>}
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-3xl font-bold">{plan.price}</span>
                  {plan.period !== "contact us" && (
                    <span className="text-muted-foreground ml-2">{plan.period}</span>
                  )}
                </div>

                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li className="flex items-center gap-2 text-sm" key={feature}>
                      <Check className="h-4 w-4 text-green-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="w-full"
                  disabled={plan.current}
                  variant={plan.current ? "outline" : "default"}
                >
                  {plan.current
                    ? "Current Plan"
                    : plan.name === "Enterprise"
                      ? "Contact Sales"
                      : "Upgrade"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Payment Method */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
          <CardDescription>Manage your payment methods and billing information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-muted">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">•••• •••• •••• 4242</p>
                <p className="text-sm text-muted-foreground">Expires 12/2025</p>
              </div>
              <Badge variant="default">Default</Badge>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline">
                Edit
              </Button>
              <Button size="sm" variant="ghost">
                Remove
              </Button>
            </div>
          </div>

          <Button variant="outline">
            <CreditCard className="h-4 w-4 mr-2" />
            Add Payment Method
          </Button>
        </CardContent>
      </Card>

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>View and download your past invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.id}</TableCell>
                    <TableCell>{invoice.date}</TableCell>
                    <TableCell>{invoice.amount}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{invoice.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost">
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
