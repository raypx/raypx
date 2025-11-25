import { isStripeConfigured, stripeUtils } from "@raypx/billing";
import { and, desc, eq, isNull, sql } from "@raypx/database";
import {
  invoice as Invoice,
  paymentMethod as PaymentMethod,
  subscription as Subscription,
} from "@raypx/database/schemas";
import { z } from "zod/v4";

import { Errors } from "../errors";
import { protectedProcedure } from "../trpc";
import { assertExists } from "../utils/error-handler";

/**
 * Billing router - handles subscription, invoice, and payment method operations
 * Supports both organization-level and user-level subscriptions
 */
export const billingRouter = {
  /**
   * Get current subscription for an organization or user
   */
  getSubscription: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        userId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Ensure exactly one of organizationId or userId is provided
      if (!input.organizationId && !input.userId) {
        throw new Error("Either organizationId or userId must be provided");
      }
      if (input.organizationId && input.userId) {
        throw new Error("Cannot provide both organizationId and userId");
      }

      const whereConditions = [
        eq(Subscription.status, "active"),
        input.organizationId
          ? and(eq(Subscription.organizationId, input.organizationId), isNull(Subscription.userId))
          : and(
              eq(Subscription.userId, input.userId as string),
              isNull(Subscription.organizationId),
            ),
      ];

      const subscription = await ctx.db.query.subscription.findFirst({
        where: and(...whereConditions),
        orderBy: desc(Subscription.createdAt),
      });

      return subscription;
    }),

  /**
   * List invoices for an organization or user
   */
  listInvoices: protectedProcedure
    .input(
      z
        .object({
          organizationId: z.string().optional(),
          userId: z.string().optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(10),
          status: z.enum(["paid", "pending", "failed", "void", "all"]).optional(),
        })
        .partial()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      // Ensure exactly one of organizationId or userId is provided
      if (!input.organizationId && !input.userId) {
        throw new Error("Either organizationId or userId must be provided");
      }
      if (input.organizationId && input.userId) {
        throw new Error("Cannot provide both organizationId and userId");
      }

      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 10;
      const offset = (page - 1) * pageSize;

      const conditions = input.organizationId
        ? [eq(Invoice.organizationId, input.organizationId), isNull(Invoice.userId)]
        : [eq(Invoice.userId, input.userId as string), isNull(Invoice.organizationId)];
      if (input.status && input.status !== "all") {
        conditions.push(eq(Invoice.status, input.status));
      }

      const where = conditions.length > 1 ? and(...conditions) : conditions[0];

      const [invoices, totalRow] = await Promise.all([
        ctx.db.query.invoice.findMany({
          where,
          orderBy: desc(Invoice.invoiceDate),
          limit: pageSize,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(Invoice)
          .where(where)
          .then((rows) => rows[0]?.count ?? 0),
      ]);

      return {
        invoices,
        pagination: {
          page,
          pageSize,
          total: Number(totalRow),
          totalPages: Math.ceil(Number(totalRow) / pageSize),
        },
      };
    }),

  /**
   * Get a single invoice by ID
   */
  getInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.db.query.invoice.findFirst({
        where: eq(Invoice.id, input.invoiceId),
      });

      assertExists(invoice, () => Errors.resourceNotFound("Invoice", input.invoiceId));

      return invoice;
    }),

  /**
   * List payment methods for an organization or user
   */
  listPaymentMethods: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        userId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Ensure exactly one of organizationId or userId is provided
      if (!input.organizationId && !input.userId) {
        throw new Error("Either organizationId or userId must be provided");
      }
      if (input.organizationId && input.userId) {
        throw new Error("Cannot provide both organizationId and userId");
      }

      const where = input.organizationId
        ? and(eq(PaymentMethod.organizationId, input.organizationId), isNull(PaymentMethod.userId))
        : and(
            eq(PaymentMethod.userId, input.userId as string),
            isNull(PaymentMethod.organizationId),
          );

      const paymentMethods = await ctx.db.query.paymentMethod.findMany({
        where,
        orderBy: [desc(PaymentMethod.isDefault), desc(PaymentMethod.createdAt)],
      });

      return paymentMethods;
    }),

  /**
   * Get default payment method for an organization or user
   */
  getDefaultPaymentMethod: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        userId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Ensure exactly one of organizationId or userId is provided
      if (!input.organizationId && !input.userId) {
        throw new Error("Either organizationId or userId must be provided");
      }
      if (input.organizationId && input.userId) {
        throw new Error("Cannot provide both organizationId and userId");
      }

      const where = input.organizationId
        ? and(
            eq(PaymentMethod.organizationId, input.organizationId),
            isNull(PaymentMethod.userId),
            eq(PaymentMethod.isDefault, true),
          )
        : and(
            eq(PaymentMethod.userId, input.userId as string),
            isNull(PaymentMethod.organizationId),
            eq(PaymentMethod.isDefault, true),
          );

      const paymentMethod = await ctx.db.query.paymentMethod.findFirst({
        where,
      });

      return paymentMethod;
    }),

  /**
   * Create checkout session for subscription (organization or user)
   */
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        userId: z.string().optional(),
        priceId: z.string(), // Stripe price ID
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      }),
    )
    .mutation(async ({ input }) => {
      // Ensure exactly one of organizationId or userId is provided
      if (!input.organizationId && !input.userId) {
        throw new Error("Either organizationId or userId must be provided");
      }
      if (input.organizationId && input.userId) {
        throw new Error("Cannot provide both organizationId and userId");
      }

      if (!isStripeConfigured()) {
        throw new Error("Stripe is not configured");
      }

      // Get or create Stripe customer
      const customerId = input.organizationId ?? (input.userId as string);
      const customer = await stripeUtils.getOrCreateCustomer(customerId);

      // Create checkout session
      const session = await stripeUtils.createCheckoutSession(
        customer.id,
        input.priceId,
        input.successUrl,
        input.cancelUrl,
        input.organizationId
          ? { organizationId: input.organizationId }
          : { userId: input.userId as string },
      );

      return {
        sessionId: session.id,
        url: session.url,
      };
    }),

  /**
   * Create billing portal session (organization or user)
   */
  createBillingPortalSession: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        userId: z.string().optional(),
        returnUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Ensure exactly one of organizationId or userId is provided
      if (!input.organizationId && !input.userId) {
        throw new Error("Either organizationId or userId must be provided");
      }
      if (input.organizationId && input.userId) {
        throw new Error("Cannot provide both organizationId and userId");
      }

      if (!isStripeConfigured()) {
        throw new Error("Stripe is not configured");
      }

      // Get subscription to find customer
      const where = input.organizationId
        ? and(eq(Subscription.organizationId, input.organizationId), isNull(Subscription.userId))
        : and(eq(Subscription.userId, input.userId as string), isNull(Subscription.organizationId));

      const subscription = await ctx.db.query.subscription.findFirst({
        where,
        orderBy: desc(Subscription.createdAt),
      });

      if (!subscription?.stripeCustomerId) {
        throw new Error(
          `No Stripe customer found for this ${input.organizationId ? "organization" : "user"}`,
        );
      }

      // Create billing portal session
      const session = await stripeUtils.createBillingPortalSession(
        subscription.stripeCustomerId,
        input.returnUrl,
      );

      return {
        url: session.url,
      };
    }),

  /**
   * Update subscription (change plan, cancel, etc.) - organization or user
   */
  updateSubscription: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        userId: z.string().optional(),
        planId: z.enum(["starter", "pro", "enterprise"]).optional(),
        cancelAtPeriodEnd: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Ensure exactly one of organizationId or userId is provided
      if (!input.organizationId && !input.userId) {
        throw new Error("Either organizationId or userId must be provided");
      }
      if (input.organizationId && input.userId) {
        throw new Error("Cannot provide both organizationId and userId");
      }

      if (!isStripeConfigured()) {
        throw new Error("Stripe is not configured");
      }

      const where = input.organizationId
        ? and(eq(Subscription.organizationId, input.organizationId), isNull(Subscription.userId))
        : and(eq(Subscription.userId, input.userId as string), isNull(Subscription.organizationId));

      const subscription = await ctx.db.query.subscription.findFirst({
        where,
        orderBy: desc(Subscription.createdAt),
      });

      if (!subscription?.stripeSubscriptionId) {
        throw new Error("No active subscription found");
      }

      // Update subscription in Stripe
      const updatedStripeSubscription = await stripeUtils.updateSubscription(
        subscription.stripeSubscriptionId,
        {
          planId: input.planId,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        },
      );

      // Update subscription in database
      // TODO: Sync subscription status and dates from Stripe response
      const updatedSubscription = await ctx.db
        .update(Subscription)
        .set({
          cancelAtPeriodEnd: updatedStripeSubscription.cancel_at_period_end ?? false,
          updatedAt: new Date(),
        })
        .where(eq(Subscription.id, subscription.id))
        .returning();

      return updatedSubscription[0];
    }),

  /**
   * Cancel subscription (organization or user)
   */
  cancelSubscription: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().optional(),
        userId: z.string().optional(),
        cancelAtPeriodEnd: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Ensure exactly one of organizationId or userId is provided
      if (!input.organizationId && !input.userId) {
        throw new Error("Either organizationId or userId must be provided");
      }
      if (input.organizationId && input.userId) {
        throw new Error("Cannot provide both organizationId and userId");
      }

      if (!isStripeConfigured()) {
        throw new Error("Stripe is not configured");
      }

      const where = input.organizationId
        ? and(eq(Subscription.organizationId, input.organizationId), isNull(Subscription.userId))
        : and(eq(Subscription.userId, input.userId as string), isNull(Subscription.organizationId));

      const subscription = await ctx.db.query.subscription.findFirst({
        where,
        orderBy: desc(Subscription.createdAt),
      });

      if (!subscription?.stripeSubscriptionId) {
        throw new Error("No active subscription found");
      }

      // Cancel subscription in Stripe
      const canceledStripeSubscription = await stripeUtils.cancelSubscription(
        subscription.stripeSubscriptionId,
        input.cancelAtPeriodEnd,
      );

      // Update subscription in database
      const updatedSubscription = await ctx.db
        .update(Subscription)
        .set({
          status:
            canceledStripeSubscription.status === "canceled" ? "canceled" : subscription.status,
          cancelAtPeriodEnd: canceledStripeSubscription.cancel_at_period_end ?? false,
          canceledAt: canceledStripeSubscription.canceled_at
            ? new Date(canceledStripeSubscription.canceled_at * 1000)
            : subscription.canceledAt,
          updatedAt: new Date(),
        })
        .where(eq(Subscription.id, subscription.id))
        .returning();

      return updatedSubscription[0];
    }),
};
