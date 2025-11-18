/**
 * Billing package types
 */

export type SubscriptionStatus = "active" | "canceled" | "past_due" | "trialing" | "incomplete";

export type PlanId = "starter" | "pro" | "enterprise";

export type InvoiceStatus = "paid" | "pending" | "failed" | "void";

export type PaymentMethodType = "card" | "bank_account" | "paypal";

export interface Plan {
  id: PlanId;
  name: string;
  price: number | null; // null for custom pricing
  currency: string;
  interval: "month" | "year" | "forever";
  description: string;
  features: string[];
  limits: {
    teamMembers?: number;
    storageGB?: number;
    apiCalls?: number;
  };
}

export interface Subscription {
  id: string;
  organizationId: string | null; // null for user-level subscriptions
  userId: string | null; // null for organization-level subscriptions
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Invoice {
  id: string;
  organizationId: string | null; // null for user-level invoices
  userId: string | null; // null for organization-level invoices
  subscriptionId: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate: Date | null;
  paidAt: Date | null;
  pdfUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentMethod {
  id: string;
  organizationId: string | null; // null for user-level payment methods
  userId: string | null; // null for organization-level payment methods
  type: PaymentMethodType;
  isDefault: boolean;
  last4?: string; // Last 4 digits of card/account
  brand?: string; // Card brand (visa, mastercard, etc.)
  expMonth?: number;
  expYear?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageStats {
  teamMembers: {
    used: number;
    limit: number;
  };
  storage: {
    used: number; // in GB
    limit: number; // in GB
  };
  apiCalls: {
    used: number;
    limit: number;
  };
}
