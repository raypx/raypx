import { useAuth } from "@raypx/auth/client";
import { useTRPC } from "@raypx/trpc/client";
import { DataTable } from "@raypx/ui/business";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  toast,
} from "@raypx/ui/components";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { Check, Clock, CreditCard, Crown, Database, Download, Rocket, Zap } from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "~/components/empty-state";
import { ErrorState } from "~/components/error-state";
import { PageWrapper } from "~/components/page-wrapper";
import { formatDate } from "~/lib/dashboard-utils";

const plans = [
  {
    id: "starter",
    name: "Starter",
    price: "$0",
    period: "forever",
    description: "Perfect for trying out",
    features: ["Up to 5 API keys", "10 GB storage", "Basic support", "API access", "1 dataset"],
    icon: Zap,
    color: "text-blue-500",
    priceId: process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID || "",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    period: "per month",
    description: "For growing teams",
    features: [
      "Up to 20 API keys",
      "100 GB storage",
      "Priority support",
      "Advanced API access",
      "10 datasets",
      "Custom integrations",
    ],
    icon: Rocket,
    color: "text-purple-500",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || "",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "contact us",
    description: "For large organizations",
    features: [
      "Unlimited API keys",
      "Unlimited storage",
      "24/7 dedicated support",
      "Enterprise API access",
      "Unlimited datasets",
      "Custom integrations",
      "SLA guarantee",
      "On-premise deployment",
    ],
    icon: Crown,
    color: "text-yellow-500",
    priceId: "",
  },
];

type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  amount: number;
  currency: string;
  status: "paid" | "pending" | "failed" | "void";
  pdfUrl: string | null;
};

export const Route = createFileRoute("/dashboard/billing/")({
  component: BillingPage,
});

function BillingPage() {
  const trpc = useTRPC();
  const {
    hooks: { useSession },
  } = useAuth();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  // Get current subscription
  const subscriptionQuery = useQuery({
    ...trpc.billing.getSubscription.queryOptions(
      { userId },
      { enabled: !!userId, staleTime: 30_000 },
    ),
  });

  // Get invoices
  const invoicesQuery = useQuery({
    ...trpc.billing.listInvoices.queryOptions(
      { userId, page: 1, pageSize: 10 },
      { enabled: !!userId, staleTime: 30_000 },
    ),
  });

  // Get payment method
  const paymentMethodQuery = useQuery({
    ...trpc.billing.getDefaultPaymentMethod.queryOptions(
      { userId },
      { enabled: !!userId, staleTime: 30_000 },
    ),
  });

  // Create checkout session mutation
  const createCheckoutMutation = useMutation({
    ...trpc.billing.createCheckoutSession.mutationOptions(),
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create checkout session");
    },
  });

  // Create billing portal session mutation
  const createBillingPortalMutation = useMutation({
    ...trpc.billing.createBillingPortalSession.mutationOptions(),
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to open billing portal");
    },
  });

  const subscription = subscriptionQuery.data;
  const invoices = invoicesQuery.data?.invoices ?? [];
  const paymentMethod = paymentMethodQuery.data ?? null;

  const currentPlan = useMemo(() => {
    if (!subscription) return null;
    return plans.find((p) => p.id === subscription.planId) || null;
  }, [subscription]);

  const handleUpgrade = (planId: string, priceId: string) => {
    if (!userId) return;

    if (planId === "enterprise") {
      // Open contact form or email
      window.location.href = "mailto:sales@raypx.com?subject=Enterprise Plan Inquiry";
      return;
    }

    if (!priceId) {
      toast.error("Price ID not configured for this plan");
      return;
    }

    const successUrl = `${window.location.origin}/dashboard/billing?success=true`;
    const cancelUrl = `${window.location.origin}/dashboard/billing?canceled=true`;

    createCheckoutMutation.mutate({
      userId,
      priceId,
      successUrl,
      cancelUrl,
    });
  };

  const handleManageBilling = () => {
    if (!userId) return;

    const returnUrl = `${window.location.origin}/dashboard/billing`;
    createBillingPortalMutation.mutate({
      userId,
      returnUrl,
    });
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  // Invoice columns
  const invoiceColumns = useMemo<ColumnDef<InvoiceListItem>[]>(
    () => [
      {
        accessorKey: "invoiceNumber",
        header: "Invoice",
        cell: ({ row }) => <div className="font-medium">{row.original.invoiceNumber}</div>,
      },
      {
        accessorKey: "invoiceDate",
        header: "Date",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {formatDate(row.original.invoiceDate)}
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: "Amount",
        enableSorting: true,
        cell: ({ row }) => (
          <div className="font-medium">
            {formatAmount(row.original.amount, row.original.currency)}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: true,
        cell: ({ row }) => {
          const status = row.original.status;
          const variant =
            status === "paid"
              ? "default"
              : status === "pending"
                ? "secondary"
                : status === "failed"
                  ? "destructive"
                  : "outline";
          return <Badge variant={variant}>{status}</Badge>;
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const invoice = row.original;
          return (
            <Button
              disabled={!invoice.pdfUrl}
              onClick={() => {
                if (invoice.pdfUrl) {
                  window.open(invoice.pdfUrl, "_blank");
                }
              }}
              size="sm"
              variant="ghost"
            >
              <Download className="h-4 w-4" />
            </Button>
          );
        },
      },
    ],
    [],
  );

  return (
    <PageWrapper spacing="md">
      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>
            {subscription
              ? `You are currently on the ${currentPlan?.name || subscription.planId} plan`
              : "You don't have an active subscription"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {subscription && currentPlan ? (
            <>
              <div className="flex items-center justify-between p-6 border rounded-lg bg-muted/50">
                <div className="flex items-center gap-4">
                  {currentPlan.icon && (
                    <div className={`p-3 rounded-lg bg-background ${currentPlan.color}`}>
                      <currentPlan.icon className="h-6 w-6" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-2xl font-bold">{currentPlan.name}</h3>
                      <Badge>Current Plan</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {currentPlan.price} {currentPlan.period}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      {subscription.status === "active" && (
                        <>
                          Next billing date:{" "}
                          {dayjs(subscription.currentPeriodEnd).format("MMMM D, YYYY")}
                        </>
                      )}
                      {subscription.status === "trialing" && subscription.trialEnd && (
                        <>Trial ends: {dayjs(subscription.trialEnd).format("MMMM D, YYYY")}</>
                      )}
                      {subscription.cancelAtPeriodEnd && (
                        <>
                          {" "}
                          • Cancels on {dayjs(subscription.currentPeriodEnd).format("MMMM D, YYYY")}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <Button onClick={handleManageBilling} variant="outline">
                  Manage Subscription
                </Button>
              </div>

              {/* Usage Stats */}
              <div className="space-y-4">
                <h4 className="font-medium">Plan Usage</h4>
                <div className="space-y-4">
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
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No active subscription</p>
              <p className="text-sm text-muted-foreground">Choose a plan below to get started</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Available Plans */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Available Plans</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = subscription?.planId === plan.id;
            return (
              <Card className={isCurrent ? "border-primary" : ""} key={plan.id}>
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <plan.icon className={`h-5 w-5 ${plan.color}`} />
                    <CardTitle>{plan.name}</CardTitle>
                    {isCurrent && <Badge variant="default">Current</Badge>}
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
                    disabled={isCurrent || createCheckoutMutation.isPending}
                    onClick={() => handleUpgrade(plan.id, plan.priceId)}
                    variant={isCurrent ? "outline" : "default"}
                  >
                    {isCurrent
                      ? "Current Plan"
                      : plan.name === "Enterprise"
                        ? "Contact Sales"
                        : "Upgrade"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Payment Method */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
          <CardDescription>Manage your payment methods and billing information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {paymentMethodQuery.isPending ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">Loading payment method...</p>
            </div>
          ) : paymentMethodQuery.isError ? (
            <ErrorState
              message={paymentMethodQuery.error?.message || "Failed to load payment method"}
              onRetry={() => paymentMethodQuery.refetch()}
              retrying={paymentMethodQuery.isFetching}
            />
          ) : paymentMethod ? (
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-muted">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">
                    {paymentMethod.brand ? `${paymentMethod.brand.toUpperCase()} ` : ""}•••• ••••
                    •••• {paymentMethod.last4 || "****"}
                  </p>
                  {paymentMethod.expMonth && paymentMethod.expYear && (
                    <p className="text-sm text-muted-foreground">
                      Expires {paymentMethod.expMonth}/{paymentMethod.expYear}
                    </p>
                  )}
                </div>
                {paymentMethod.isDefault && <Badge variant="default">Default</Badge>}
              </div>
              <Button onClick={handleManageBilling} variant="outline">
                Manage
              </Button>
            </div>
          ) : (
            <EmptyState
              actionLabel={
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Add Payment Method
                </>
              }
              description="No payment method on file"
              icon={CreditCard}
              onAction={handleManageBilling}
              title="No Payment Method"
            />
          )}
        </CardContent>
      </Card>

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>View and download your past invoices</CardDescription>
        </CardHeader>
        <CardContent>
          {invoicesQuery.isPending ? (
            <DataTable columns={invoiceColumns} data={[]} isLoading={true} />
          ) : invoicesQuery.isError ? (
            <ErrorState
              message={invoicesQuery.error?.message || "Failed to load invoices"}
              onRetry={() => invoicesQuery.refetch()}
              retrying={invoicesQuery.isFetching}
            />
          ) : invoices.length === 0 ? (
            <EmptyState description="No invoices found" icon={Download} title="No Invoices" />
          ) : (
            <DataTable columns={invoiceColumns} data={invoices} />
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
