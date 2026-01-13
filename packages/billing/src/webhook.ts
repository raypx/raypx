import { db } from "@raypx/database";
import { invoice, subscription } from "@raypx/database/schema";
import { eq } from "@raypx/database/sql";
import { createLogger } from "@raypx/logger";
import type Stripe from "stripe";
import { env } from "./env";
import { stripe } from "./stripe";

const logger = createLogger({ name: "billing" });

type WebhookHandler = (event: Stripe.Event) => Promise<void>;

// Helper to extract subscription ID from Invoice (Stripe v20+ API)
function getSubscriptionIdFromInvoice(inv: Stripe.Invoice): string | null {
  const subDetails = inv.parent?.subscription_details;
  if (!subDetails) return null;
  return typeof subDetails.subscription === "string"
    ? subDetails.subscription
    : (subDetails.subscription?.id ?? null);
}

// Helper to get current period from subscription items (Stripe v20+ API)
function getCurrentPeriod(sub: Stripe.Subscription) {
  const firstItem = sub.items.data[0];
  if (!firstItem) return { start: null, end: null };
  return {
    start: new Date(firstItem.current_period_start * 1000),
    end: new Date(firstItem.current_period_end * 1000),
  };
}

const handlers: Record<string, WebhookHandler> = {
  "checkout.session.completed": async (event) => {
    const session = event.data.object as Stripe.Checkout.Session;

    if (session.mode === "subscription" && session.subscription) {
      const stripeSubscription = await stripe.subscriptions.retrieve(
        session.subscription as string,
      );

      const organizationId = session.metadata?.organizationId;
      if (!organizationId) {
        logger.error("No organizationId in session metadata");
        return;
      }

      // Find or create subscription record
      const existingSub = await db.query.subscription.findFirst({
        where: eq(subscription.organizationId, organizationId),
      });

      const period = getCurrentPeriod(stripeSubscription);
      const subData = {
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: stripeSubscription.customer as string,
        status: stripeSubscription.status as typeof subscription.$inferInsert.status,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end ? 1 : 0,
      };

      if (existingSub) {
        await db.update(subscription).set(subData).where(eq(subscription.id, existingSub.id));
      } else {
        const priceId = stripeSubscription.items.data[0]?.price.id;
        const plan = await db.query.plan.findFirst({
          where: (p, { eq }) => eq(p.stripePriceId, priceId || ""),
        });

        await db.insert(subscription).values({
          id: crypto.randomUUID(),
          organizationId,
          planId: plan?.id || "free",
          ...subData,
        });
      }
    }
  },

  "customer.subscription.updated": async (event) => {
    const stripeSubscription = event.data.object as Stripe.Subscription;
    const period = getCurrentPeriod(stripeSubscription);

    await db
      .update(subscription)
      .set({
        status: stripeSubscription.status as typeof subscription.$inferInsert.status,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end ? 1 : 0,
        canceledAt: stripeSubscription.canceled_at
          ? new Date(stripeSubscription.canceled_at * 1000)
          : null,
      })
      .where(eq(subscription.stripeSubscriptionId, stripeSubscription.id));
  },

  "customer.subscription.deleted": async (event) => {
    const stripeSubscription = event.data.object as Stripe.Subscription;

    await db
      .update(subscription)
      .set({
        status: "canceled",
        canceledAt: new Date(),
      })
      .where(eq(subscription.stripeSubscriptionId, stripeSubscription.id));
  },

  "invoice.paid": async (event) => {
    const stripeInvoice = event.data.object as Stripe.Invoice;
    const subscriptionId = getSubscriptionIdFromInvoice(stripeInvoice);

    if (!subscriptionId) return;

    const sub = await db.query.subscription.findFirst({
      where: eq(subscription.stripeSubscriptionId, subscriptionId),
    });

    if (sub) {
      await db.insert(invoice).values({
        id: crypto.randomUUID(),
        subscriptionId: sub.id,
        organizationId: sub.organizationId,
        stripeInvoiceId: stripeInvoice.id,
        status: "paid",
        currency: stripeInvoice.currency,
        amountDue: stripeInvoice.amount_due,
        amountPaid: stripeInvoice.amount_paid,
        amountRemaining: stripeInvoice.amount_remaining,
        invoiceUrl: stripeInvoice.invoice_pdf,
        invoicePdf: stripeInvoice.invoice_pdf,
        hostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
        periodStart: stripeInvoice.period_start
          ? new Date(stripeInvoice.period_start * 1000)
          : null,
        periodEnd: stripeInvoice.period_end ? new Date(stripeInvoice.period_end * 1000) : null,
        paidAt: new Date(),
      });
    }
  },

  "invoice.payment_failed": async (event) => {
    const stripeInvoice = event.data.object as Stripe.Invoice;
    const subscriptionId = getSubscriptionIdFromInvoice(stripeInvoice);

    // Update subscription status
    if (subscriptionId) {
      await db
        .update(subscription)
        .set({
          status: "past_due",
        })
        .where(eq(subscription.stripeSubscriptionId, subscriptionId));
    }
  },
};

export async function handleWebhook(
  body: string,
  signature: string,
): Promise<{ received: boolean }> {
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error("Webhook signature verification failed", err);
    throw new Error("Invalid webhook signature");
  }

  const handler = handlers[event.type];
  if (handler) {
    try {
      await handler(event);
    } catch (err) {
      logger.error(`Error handling webhook ${event.type}`, err);
      throw err;
    }
  } else {
    logger.info(`Unhandled webhook event: ${event.type}`);
  }

  return { received: true };
}
