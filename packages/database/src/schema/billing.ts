import { relations } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

// Enums
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "past_due",
  "trialing",
  "unpaid",
  "paused",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "open",
  "paid",
  "void",
  "uncollectible",
]);

export const planIntervalEnum = pgEnum("plan_interval", ["month", "year", "week", "day"]);

// Plans - Available subscription plans
export const plan = pgTable("plan", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  stripePriceId: text("stripe_price_id").notNull().unique(),
  stripeProductId: text("stripe_product_id").notNull(),
  price: integer("price").notNull(), // in cents
  currency: text("currency").notNull().default("usd"),
  interval: planIntervalEnum("interval").notNull().default("month"),
  intervalCount: integer("interval_count").notNull().default(1),
  trialDays: integer("trial_days").default(0),
  features: text("features"), // JSON string of features
  metadata: text("metadata"), // JSON string for extra data
  isActive: integer("is_active").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Subscriptions - Organization subscriptions
export const subscription = pgTable(
  "subscription",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plan.id),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    stripeCustomerId: text("stripe_customer_id"),
    status: subscriptionStatusEnum("status").notNull().default("incomplete"),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: integer("cancel_at_period_end").default(0),
    canceledAt: timestamp("canceled_at"),
    trialStart: timestamp("trial_start"),
    trialEnd: timestamp("trial_end"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("subscription_organizationId_idx").on(table.organizationId),
    index("subscription_stripeSubscriptionId_idx").on(table.stripeSubscriptionId),
    index("subscription_status_idx").on(table.status),
  ],
);

// Invoices - Payment invoices
export const invoice = pgTable(
  "invoice",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id").references(() => subscription.id, {
      onDelete: "set null",
    }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    stripeInvoiceId: text("stripe_invoice_id").unique(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    currency: text("currency").notNull().default("usd"),
    amountDue: integer("amount_due").notNull(), // in cents
    amountPaid: integer("amount_paid").default(0),
    amountRemaining: integer("amount_remaining"),
    invoiceUrl: text("invoice_url"),
    invoicePdf: text("invoice_pdf"),
    hostedInvoiceUrl: text("hosted_invoice_url"),
    periodStart: timestamp("period_start"),
    periodEnd: timestamp("period_end"),
    dueDate: timestamp("due_date"),
    paidAt: timestamp("paid_at"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("invoice_subscriptionId_idx").on(table.subscriptionId),
    index("invoice_organizationId_idx").on(table.organizationId),
    index("invoice_stripeInvoiceId_idx").on(table.stripeInvoiceId),
    index("invoice_status_idx").on(table.status),
  ],
);

// Usage Records - For metered billing
export const usageRecord = pgTable(
  "usage_record",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => subscription.id, { onDelete: "cascade" }),
    featureKey: text("feature_key").notNull(), // e.g., "api_calls", "storage_gb"
    quantity: integer("quantity").notNull(),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("usage_subscriptionId_idx").on(table.subscriptionId),
    index("usage_featureKey_idx").on(table.featureKey),
    index("usage_timestamp_idx").on(table.timestamp),
  ],
);

// Payment Methods - Stored payment methods
export const paymentMethod = pgTable(
  "payment_method",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    stripePaymentMethodId: text("stripe_payment_method_id").notNull().unique(),
    type: text("type").notNull(), // card, bank_account, etc.
    isDefault: integer("is_default").default(0),
    // Card details (if type is card)
    cardBrand: text("card_brand"),
    cardLast4: text("card_last4"),
    cardExpMonth: integer("card_exp_month"),
    cardExpYear: integer("card_exp_year"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("payment_method_organizationId_idx").on(table.organizationId),
    index("payment_method_stripePaymentMethodId_idx").on(table.stripePaymentMethodId),
  ],
);

// Relations
export const planRelations = relations(plan, ({ many }) => ({
  subscriptions: many(subscription),
}));

export const subscriptionRelations = relations(subscription, ({ one, many }) => ({
  organization: one(organization, {
    fields: [subscription.organizationId],
    references: [organization.id],
  }),
  plan: one(plan, {
    fields: [subscription.planId],
    references: [plan.id],
  }),
  invoices: many(invoice),
  usageRecords: many(usageRecord),
}));

export const invoiceRelations = relations(invoice, ({ one }) => ({
  subscription: one(subscription, {
    fields: [invoice.subscriptionId],
    references: [subscription.id],
  }),
  organization: one(organization, {
    fields: [invoice.organizationId],
    references: [organization.id],
  }),
}));

export const usageRecordRelations = relations(usageRecord, ({ one }) => ({
  subscription: one(subscription, {
    fields: [usageRecord.subscriptionId],
    references: [subscription.id],
  }),
}));

export const paymentMethodRelations = relations(paymentMethod, ({ one }) => ({
  organization: one(organization, {
    fields: [paymentMethod.organizationId],
    references: [organization.id],
  }),
}));
