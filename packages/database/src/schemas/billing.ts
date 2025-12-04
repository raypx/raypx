import type { InferSelectModel } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { boolean, index, integer, pgEnum, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "../utils";
import { pgTable } from "./_table";
import { user } from "./auth";
import { organization } from "./organizations";

/**
 * Subscription status enum
 */
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "canceled",
  "past_due",
  "trialing",
  "incomplete",
]);

/**
 * Invoice status enum
 */
export const invoiceStatusEnum = pgEnum("invoice_status", ["paid", "pending", "failed", "void"]);

/**
 * Payment method type enum
 */
export const paymentMethodTypeEnum = pgEnum("payment_method_type", [
  "card",
  "bank_account",
  "paypal",
]);

/**
 * Subscription table
 * Supports both organization-level and user-level subscriptions
 * Either organizationId or userId must be provided (but not both)
 */
export const subscription = pgTable(
  "subscription",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    // Organization-level subscription (for teams)
    organizationId: uuid("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    // User-level subscription (for individual users)
    userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
    planId: text("plan_id").notNull(), // starter, pro, enterprise
    status: subscriptionStatusEnum("status").notNull().default("incomplete"),
    currentPeriodStart: timestamp("current_period_start").notNull(),
    currentPeriodEnd: timestamp("current_period_end").notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    canceledAt: timestamp("canceled_at"),
    trialStart: timestamp("trial_start"),
    trialEnd: timestamp("trial_end"),
    stripeSubscriptionId: text("stripe_subscription_id"), // External payment provider ID
    stripeCustomerId: text("stripe_customer_id"), // External payment provider customer ID
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => /* @__PURE__ */ new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .$onUpdateFn(() => /* @__PURE__ */ new Date()),
  },
  (table) => [
    index("idx_subscription_organization_id").on(table.organizationId),
    index("idx_subscription_user_id").on(table.userId),
    index("idx_subscription_status").on(table.status),
    index("idx_subscription_stripe_subscription_id").on(table.stripeSubscriptionId),
  ],
);

/**
 * Invoice table
 * Supports both organization-level and user-level invoices
 */
export const invoice = pgTable(
  "invoice",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    // Organization-level invoice (for teams)
    organizationId: uuid("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    // User-level invoice (for individual users)
    userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscription.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(), // Amount in cents
    currency: text("currency").notNull().default("usd"),
    status: invoiceStatusEnum("status").notNull().default("pending"),
    invoiceNumber: text("invoice_number").notNull().unique(),
    invoiceDate: timestamp("invoice_date").notNull(),
    dueDate: timestamp("due_date"),
    paidAt: timestamp("paid_at"),
    pdfUrl: text("pdf_url"),
    stripeInvoiceId: text("stripe_invoice_id"), // External payment provider invoice ID
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => /* @__PURE__ */ new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .$onUpdateFn(() => /* @__PURE__ */ new Date()),
  },
  (table) => [
    index("idx_invoice_organization_id").on(table.organizationId),
    index("idx_invoice_user_id").on(table.userId),
    index("idx_invoice_subscription_id").on(table.subscriptionId),
    index("idx_invoice_status").on(table.status),
    index("idx_invoice_stripe_invoice_id").on(table.stripeInvoiceId),
  ],
);

/**
 * Payment method table
 * Supports both organization-level and user-level payment methods
 */
export const paymentMethod = pgTable(
  "payment_method",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    // Organization-level payment method (for teams)
    organizationId: uuid("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    // User-level payment method (for individual users)
    userId: uuid("user_id").references(() => user.id, { onDelete: "cascade" }),
    type: paymentMethodTypeEnum("type").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    last4: text("last4"), // Last 4 digits of card/account
    brand: text("brand"), // Card brand (visa, mastercard, etc.)
    expMonth: integer("exp_month"), // Expiration month (1-12)
    expYear: integer("exp_year"), // Expiration year
    stripePaymentMethodId: text("stripe_payment_method_id"), // External payment provider ID
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => /* @__PURE__ */ new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .$onUpdateFn(() => /* @__PURE__ */ new Date()),
  },
  (table) => [
    index("idx_payment_method_organization_id").on(table.organizationId),
    index("idx_payment_method_user_id").on(table.userId),
    index("idx_payment_method_stripe_payment_method_id").on(table.stripePaymentMethodId),
  ],
);

/**
 * Relations
 * Note: organization and user relations are optional (one can be null)
 * Use query builder with proper where conditions to filter by organizationId or userId
 */
export const subscriptionRelations = relations(subscription, ({ one, many }) => ({
  // Optional organization relation (only present when organizationId is not null)
  organization: one(organization, {
    fields: [subscription.organizationId],
    references: [organization.id],
    relationName: "organization_subscriptions",
  }),
  // Optional user relation (only present when userId is not null)
  user: one(user, {
    fields: [subscription.userId],
    references: [user.id],
    relationName: "user_subscriptions",
  }),
  invoices: many(invoice),
}));

export const invoiceRelations = relations(invoice, ({ one }) => ({
  // Optional organization relation (only present when organizationId is not null)
  organization: one(organization, {
    fields: [invoice.organizationId],
    references: [organization.id],
    relationName: "organization_invoices",
  }),
  // Optional user relation (only present when userId is not null)
  user: one(user, {
    fields: [invoice.userId],
    references: [user.id],
    relationName: "user_invoices",
  }),
  subscription: one(subscription, {
    fields: [invoice.subscriptionId],
    references: [subscription.id],
  }),
}));

export const paymentMethodRelations = relations(paymentMethod, ({ one }) => ({
  // Optional organization relation (only present when organizationId is not null)
  organization: one(organization, {
    fields: [paymentMethod.organizationId],
    references: [organization.id],
    relationName: "organization_payment_methods",
  }),
  // Optional user relation (only present when userId is not null)
  user: one(user, {
    fields: [paymentMethod.userId],
    references: [user.id],
    relationName: "user_payment_methods",
  }),
}));

export type Subscription = InferSelectModel<typeof subscription>;
export type Invoice = InferSelectModel<typeof invoice>;
export type PaymentMethod = InferSelectModel<typeof paymentMethod>;
