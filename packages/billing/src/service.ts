import { db } from "@raypx/database";
import { invoice, subscription, usageRecord } from "@raypx/database/schema/billing";
import { eq } from "@raypx/database/sql";
import type { Stripe } from "./stripe";
import { stripe } from "./stripe";

export class BillingService {
  /**
   * Create or retrieve a Stripe customer for an organization
   */
  async getOrCreateCustomer(
    organizationId: string,
    email: string,
    name?: string,
  ): Promise<Stripe.Customer> {
    // Check if organization already has a subscription with a customer ID
    const existingSub = await db.query.subscription.findFirst({
      where: eq(subscription.organizationId, organizationId),
    });

    if (existingSub?.stripeCustomerId) {
      const customer = await stripe.customers.retrieve(existingSub.stripeCustomerId);
      if (!customer.deleted) {
        return customer as Stripe.Customer;
      }
    }

    // Create a new customer
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        organizationId,
      },
    });

    return customer;
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(params: {
    organizationId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    customerId?: string;
    trialDays?: number;
  }): Promise<Stripe.Checkout.Session> {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: params.priceId,
          quantity: 1,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        organizationId: params.organizationId,
      },
    };

    if (params.customerId) {
      sessionParams.customer = params.customerId;
    }

    if (params.trialDays && params.trialDays > 0) {
      sessionParams.subscription_data = {
        trial_period_days: params.trialDays,
      };
    }

    return stripe.checkout.sessions.create(sessionParams);
  }

  /**
   * Create a billing portal session
   */
  async createPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<Stripe.BillingPortal.Session> {
    return stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string, immediately = false): Promise<void> {
    const sub = await db.query.subscription.findFirst({
      where: eq(subscription.id, subscriptionId),
    });

    if (!sub?.stripeSubscriptionId) {
      throw new Error("Subscription not found");
    }

    if (immediately) {
      await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    } else {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }
  }

  /**
   * Resume a canceled subscription
   */
  async resumeSubscription(subscriptionId: string): Promise<void> {
    const sub = await db.query.subscription.findFirst({
      where: eq(subscription.id, subscriptionId),
    });

    if (!sub?.stripeSubscriptionId) {
      throw new Error("Subscription not found");
    }

    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
  }

  /**
   * Change subscription plan
   */
  async changePlan(subscriptionId: string, newPriceId: string): Promise<Stripe.Subscription> {
    const sub = await db.query.subscription.findFirst({
      where: eq(subscription.id, subscriptionId),
    });

    if (!sub?.stripeSubscriptionId) {
      throw new Error("Subscription not found");
    }

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);

    return stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [
        {
          id: stripeSub.items.data[0]?.id,
          price: newPriceId,
        },
      ],
      proration_behavior: "create_prorations",
    });
  }

  /**
   * Get subscription for an organization
   */
  async getSubscription(organizationId: string) {
    return db.query.subscription.findFirst({
      where: eq(subscription.organizationId, organizationId),
      with: {
        plan: true,
      },
    });
  }

  /**
   * Get invoices for an organization
   */
  async getInvoices(organizationId: string, limit = 10) {
    return db.query.invoice.findMany({
      where: eq(invoice.organizationId, organizationId),
      orderBy: (invoice, { desc }) => [desc(invoice.createdAt)],
      limit,
    });
  }

  /**
   * Record usage for metered billing
   */
  async recordUsage(subscriptionId: string, featureKey: string, quantity: number): Promise<void> {
    const id = crypto.randomUUID();
    await db.insert(usageRecord).values({
      id,
      subscriptionId,
      featureKey,
      quantity,
    });
  }
}

export const billingService = new BillingService();
