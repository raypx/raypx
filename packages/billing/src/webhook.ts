import { db, eq, schemas } from "@raypx/db";
import { logger } from "@raypx/shared/logger";
import type { Stripe } from "stripe";
import { envs } from "./envs";
import { stripe } from "./stripe";

const subscriptionTable = schemas.subscription;
const invoiceTable = schemas.invoice;
const paymentMethodTable = schemas.paymentMethod;

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
): Stripe.Event | null {
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }

  try {
    const env = envs();
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new Error("Stripe webhook secret is not configured");
    }
    return stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error("Webhook signature verification failed:", err);
    return null;
  }
}

/**
 * Map Stripe subscription status to our subscription status
 */
export function mapStripeSubscriptionStatus(
  stripeStatus: Stripe.Subscription.Status,
): "active" | "canceled" | "past_due" | "trialing" | "incomplete" {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "past_due":
      return "past_due";
    case "trialing":
      return "trialing";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return "incomplete";
  }
}

/**
 * Map Stripe invoice status to our invoice status
 */
export function mapStripeInvoiceStatus(
  stripeStatus: Stripe.Invoice.Status,
): "paid" | "pending" | "failed" | "void" {
  switch (stripeStatus) {
    case "paid":
      return "paid";
    case "open":
    case "draft":
      return "pending";
    case "uncollectible":
    case "void":
      return "void";
    default:
      return "pending";
  }
}

/**
 * Get period start date with Stripe API version compatibility
 * Stripe < 18: subscription.current_period_start
 * Stripe 18+: subscription.items.data[0].current_period_start
 */
function getPeriodStartsAt(subscription: Stripe.Subscription): number {
  // Stripe 17 and below
  if ("current_period_start" in subscription) {
    return subscription.current_period_start as number;
  }

  // Stripe 18+
  return subscription.items.data[0]!.current_period_start;
}

/**
 * Get period end date with Stripe API version compatibility
 * Stripe < 18: subscription.current_period_end
 * Stripe 18+: subscription.items.data[0].current_period_end
 */
function getPeriodEndsAt(subscription: Stripe.Subscription): number {
  // Stripe 17 and below
  if ("current_period_end" in subscription) {
    return subscription.current_period_end as number;
  }

  // Stripe 18+
  return subscription.items.data[0]!.current_period_end;
}

/**
 * Get userId from subscription metadata
 * The subscription metadata should contain userId set during checkout creation
 */
function getUserIdFromSubscription(subscription: Stripe.Subscription): string | null {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    logger.error("Subscription metadata missing userId:", subscription.id);
    return null;
  }
  return userId;
}

/**
 * Sync Stripe subscription to database
 */
async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  try {
    const userId = getUserIdFromSubscription(subscription);
    if (!userId) {
      logger.error("Cannot sync subscription without userId:", subscription.id);
      return;
    }

    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

    const periodStartsAt = getPeriodStartsAt(subscription);
    const periodEndsAt = getPeriodEndsAt(subscription);

    const subscriptionData = {
      userId,
      organizationId: null, // For now, only support user-level subscriptions
      planId: subscription.items.data[0]?.price?.id ?? "unknown",
      status: mapStripeSubscriptionStatus(subscription.status),
      currentPeriodStart: new Date(periodStartsAt * 1000),
      currentPeriodEnd: new Date(periodEndsAt * 1000),
      cancelAtPeriodEnd: (subscription as any).cancel_at_period_end ?? false,
      canceledAt: (subscription as any).canceled_at
        ? new Date((subscription as any).canceled_at * 1000)
        : null,
      trialStart: (subscription as any).trial_start
        ? new Date((subscription as any).trial_start * 1000)
        : null,
      trialEnd: (subscription as any).trial_end
        ? new Date((subscription as any).trial_end * 1000)
        : null,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
    };

    // Check if subscription already exists
    const existing = await db.query.subscription.findFirst({
      where: eq(subscriptionTable.stripeSubscriptionId, subscription.id),
    });

    if (existing) {
      // Update existing subscription
      await db
        .update(subscriptionTable)
        .set({
          ...subscriptionData,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionTable.id, existing.id));
      logger.info("Subscription updated:", subscription.id);
    } else {
      // Insert new subscription
      await db.insert(subscriptionTable).values(subscriptionData);
      logger.info("Subscription created:", subscription.id);
    }
  } catch (error) {
    logger.error("Failed to sync subscription:", error);
    throw error;
  }
}

/**
 * Sync Stripe invoice to database
 */
async function syncInvoice(invoice: Stripe.Invoice, subscriptionId: string): Promise<void> {
  try {
    // Find subscription in our database
    const dbSubscription = await db.query.subscription.findFirst({
      where: eq(subscriptionTable.stripeSubscriptionId, subscriptionId),
    });

    if (!dbSubscription) {
      logger.error("Subscription not found in database:", subscriptionId);
      return;
    }

    const invoiceData = {
      userId: dbSubscription.userId,
      organizationId: null, // For now, only support user-level invoices
      subscriptionId: dbSubscription.id,
      amount: invoice.amount_due ?? 0,
      currency: invoice.currency ?? "usd",
      status: mapStripeInvoiceStatus(invoice.status ?? "draft"),
      invoiceNumber: invoice.number ?? `inv_${invoice.id}`,
      invoiceDate: new Date((invoice.created ?? Date.now() / 1000) * 1000),
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
      paidAt:
        invoice.status === "paid" && invoice.status_transitions?.paid_at
          ? new Date(invoice.status_transitions.paid_at * 1000)
          : null,
      pdfUrl: invoice.invoice_pdf ?? null,
      stripeInvoiceId: invoice.id,
    };

    // Check if invoice already exists
    const existing = await db.query.invoice.findFirst({
      where: eq(invoiceTable.stripeInvoiceId, invoice.id),
    });

    if (existing) {
      // Update existing invoice
      await db
        .update(invoiceTable)
        .set({
          ...invoiceData,
          updatedAt: new Date(),
        })
        .where(eq(invoiceTable.id, existing.id));
      logger.info("Invoice updated:", invoice.id);
    } else {
      // Insert new invoice
      await db.insert(invoiceTable).values(invoiceData);
      logger.info("Invoice created:", invoice.id);
    }
  } catch (error) {
    logger.error("Failed to sync invoice:", error);
    throw error;
  }
}

/**
 * Handle checkout.session.completed event
 * This is the most important event - fired when a payment is successful
 */
async function handleCheckoutSessionCompleted(
  event: Stripe.CheckoutSessionCompletedEvent,
): Promise<void> {
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }

  const session = event.data.object;
  const isSubscription = session.mode === "subscription";

  if (isSubscription) {
    // Handle subscription checkout
    const subscriptionId = session.subscription as string;
    if (!subscriptionId) {
      logger.error("Checkout session missing subscription ID:", session.id);
      return;
    }

    // Retrieve full subscription object
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    await syncSubscription(subscription);

    logger.info("Checkout session completed (subscription):", session.id);
  } else {
    // Handle one-time payment
    // For now, we don't track one-time payments in subscription table
    // You can implement order tracking here if needed
    logger.info("Checkout session completed (one-time payment):", session.id);
  }
}

/**
 * Handle subscription created/updated event
 */
async function handleSubscriptionUpdated(
  event: Stripe.CustomerSubscriptionCreatedEvent | Stripe.CustomerSubscriptionUpdatedEvent,
): Promise<void> {
  const subscription = event.data.object;
  await syncSubscription(subscription);
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(
  event: Stripe.CustomerSubscriptionDeletedEvent,
): Promise<void> {
  const subscription = event.data.object;

  try {
    // Find subscription in database
    const existing = await db.query.subscription.findFirst({
      where: eq(subscriptionTable.stripeSubscriptionId, subscription.id),
    });

    if (existing) {
      // Update status to canceled
      await db
        .update(subscriptionTable)
        .set({
          status: "canceled",
          canceledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptionTable.id, existing.id));
      logger.info("Subscription deleted:", subscription.id);
    }
  } catch (error) {
    logger.error("Failed to handle subscription deletion:", error);
    throw error;
  }
}

/**
 * Handle invoice.paid event
 * Important: We need to re-sync the subscription because status might have changed
 * (e.g., from trialing to active after first payment)
 */
async function handleInvoicePaid(event: Stripe.InvoicePaidEvent): Promise<void> {
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }

  const invoice = event.data.object;
  const invoiceId = invoice.id;

  if (!invoiceId) {
    logger.warn("Invoice not found. Will not handle invoice.paid event.");
    return;
  }

  let subscriptionId: string | undefined;

  // Stripe API version compatibility
  // Stripe < 18: invoice.subscription exists
  // Stripe 18+: invoice.parent.subscription_details.subscription
  if ("subscription" in invoice && invoice.subscription) {
    subscriptionId = invoice.subscription as string;
  } else {
    subscriptionId = (invoice as any).parent?.subscription_details?.subscription as string;
  }

  if (!subscriptionId) {
    logger.warn("Subscription ID not found for invoice. Will not handle invoice.paid event.");
    return;
  }

  // Retrieve and sync subscription
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  if (!subscription) {
    logger.warn("Subscription not found. Will not handle invoice.paid event.");
    return;
  }

  // Sync subscription (status might have changed from trialing to active)
  await syncSubscription(subscription);

  // Sync invoice
  await syncInvoice(invoice, subscriptionId);

  logger.info("Invoice paid and synced:", invoiceId);
}

/**
 * Handle payment_method.attached event
 */
async function handlePaymentMethodAttached(
  event: Stripe.PaymentMethodAttachedEvent,
): Promise<void> {
  const paymentMethod = event.data.object;

  try {
    const customerId =
      typeof paymentMethod.customer === "string"
        ? paymentMethod.customer
        : paymentMethod.customer?.id;
    if (!customerId) {
      logger.error("Payment method missing customer:", paymentMethod.id);
      return;
    }

    // We can't get userId from payment method directly
    // Need to find it from existing subscriptions with this customer
    const existingSubscription = await db.query.subscription.findFirst({
      where: eq(subscriptionTable.stripeCustomerId, customerId),
    });

    if (!existingSubscription) {
      logger.warn("No subscription found for customer:", customerId);
      return;
    }

    // Map Stripe payment method type to our enum
    let pmType: "card" | "bank_account" | "paypal";
    if (paymentMethod.type === "card") {
      pmType = "card";
    } else if (paymentMethod.type === "us_bank_account" || paymentMethod.type === "sepa_debit") {
      pmType = "bank_account";
    } else {
      pmType = "paypal";
    }

    const paymentMethodData = {
      userId: existingSubscription.userId,
      organizationId: null,
      type: pmType,
      isDefault: false,
      last4: paymentMethod.card?.last4 ?? null,
      brand: paymentMethod.card?.brand ?? null,
      expMonth: paymentMethod.card?.exp_month ?? null,
      expYear: paymentMethod.card?.exp_year ?? null,
      stripePaymentMethodId: paymentMethod.id,
    };

    // Check if payment method already exists
    const existing = await db.query.paymentMethod.findFirst({
      where: eq(paymentMethodTable.stripePaymentMethodId, paymentMethod.id),
    });

    if (existing) {
      await db
        .update(paymentMethodTable)
        .set({
          ...paymentMethodData,
          updatedAt: new Date(),
        })
        .where(eq(paymentMethodTable.id, existing.id));
      logger.info("Payment method updated:", paymentMethod.id);
    } else {
      await db.insert(paymentMethodTable).values(paymentMethodData);
      logger.info("Payment method created:", paymentMethod.id);
    }
  } catch (error) {
    logger.error("Failed to sync payment method:", error);
    throw error;
  }
}

/**
 * Handle Stripe webhook events
 * Based on MakerKit's implementation with proper event handling
 */
export async function handleStripeWebhook(event: Stripe.Event): Promise<void> {
  try {
    switch (event.type) {
      // Most important event: checkout completed
      case "checkout.session.completed": {
        await handleCheckoutSessionCompleted(event);
        break;
      }

      // Subscription lifecycle events
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await handleSubscriptionUpdated(event);
        break;
      }

      case "customer.subscription.deleted": {
        await handleSubscriptionDeleted(event);
        break;
      }

      // Invoice events
      case "invoice.paid": {
        await handleInvoicePaid(event);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        logger.warn("Invoice payment failed:", invoice.id);
        // You can implement notification logic here
        break;
      }

      // Payment method events
      case "payment_method.attached": {
        await handlePaymentMethodAttached(event);
        break;
      }

      // Async payment events
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        logger.info("Async payment succeeded:", session.id);
        // Handle async payment success if needed
        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object;
        logger.warn("Async payment failed:", session.id);
        // Handle async payment failure if needed
        break;
      }

      default: {
        logger.info("Unhandled webhook event type:", event.type);
      }
    }
  } catch (error) {
    logger.error("Webhook handler error:", {
      eventType: event.type,
      eventId: event.id,
      error,
    });
    throw error;
  }
}
