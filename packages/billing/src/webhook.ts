import { logger } from "@raypx/shared/logger";
import type { Stripe } from "stripe";
import { envs } from "./envs";
import { stripe } from "./stripe";

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
 * Handle Stripe webhook events
 */
export async function handleStripeWebhook(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      // TODO: Sync subscription to database
      logger.info("Subscription event:", event.type, subscription.id);
      break;
    }

    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.payment_action_required": {
      const invoice = event.data.object as Stripe.Invoice;
      // TODO: Sync invoice to database
      logger.info("Invoice event:", event.type, invoice.id);
      break;
    }

    case "payment_method.attached": {
      const paymentMethod = event.data.object as Stripe.PaymentMethod;
      // TODO: Sync payment method to database
      logger.info("Payment method attached:", paymentMethod.id);
      break;
    }

    default:
      logger.info("Unhandled webhook event type:", event.type);
  }
}
