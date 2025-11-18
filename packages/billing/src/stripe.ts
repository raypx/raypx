import Stripe from "stripe";
import { envs } from "./envs";

/**
 * Stripe client instance
 * Only initialized if STRIPE_SECRET_KEY is provided
 */
const getStripeClient = () => {
  try {
    const env = envs();
    if (env.STRIPE_SECRET_KEY) {
      return new Stripe(env.STRIPE_SECRET_KEY, {
        apiVersion: "2025-10-29.clover",
        typescript: true,
      });
    }
    return null;
  } catch {
    return null;
  }
};

export const stripe = getStripeClient();

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  try {
    const env = envs();
    return stripe !== null && !!env.STRIPE_SECRET_KEY;
  } catch {
    return false;
  }
}

/**
 * Stripe utility functions
 */
export const stripeUtils = {
  /**
   * Create or retrieve a Stripe customer for an organization
   */
  async getOrCreateCustomer(
    organizationId: string,
    email?: string,
    name?: string,
  ): Promise<Stripe.Customer> {
    if (!stripe) {
      throw new Error("Stripe is not configured");
    }

    // First, try to find existing customer by metadata
    // Note: Stripe doesn't support filtering by metadata in list, so we search by email or name
    // In production, you might want to store stripeCustomerId in your database
    const existingCustomers = email
      ? await stripe.customers.list({
          email,
          limit: 1,
        })
      : { data: [] };

    if (existingCustomers.data.length > 0) {
      return existingCustomers.data[0]!;
    }

    // Create new customer
    return stripe.customers.create({
      email,
      name,
      metadata: {
        organizationId,
      },
    });
  },

  /**
   * Create a subscription for a customer
   */
  async createSubscription(
    customerId: string,
    priceId: string,
    metadata?: Record<string, string>,
  ): Promise<Stripe.Subscription> {
    if (!stripe) {
      throw new Error("Stripe is not configured");
    }

    return stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      metadata,
      expand: ["latest_invoice.payment_intent"],
    });
  },

  /**
   * Update a subscription
   */
  async updateSubscription(
    subscriptionId: string,
    updates: {
      planId?: string;
      cancelAtPeriodEnd?: boolean;
      metadata?: Record<string, string>;
    },
  ): Promise<Stripe.Subscription> {
    if (!stripe) {
      throw new Error("Stripe is not configured");
    }

    const updateParams: Stripe.SubscriptionUpdateParams = {};

    if (updates.cancelAtPeriodEnd !== undefined) {
      updateParams.cancel_at_period_end = updates.cancelAtPeriodEnd;
    }

    if (updates.metadata) {
      updateParams.metadata = updates.metadata;
    }

    if (updates.planId) {
      // Get current subscription to find the subscription item
      const currentSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      const subscriptionItemId = currentSubscription.items.data[0]?.id;

      if (subscriptionItemId) {
        // Note: In production, you'd need to map planId to Stripe priceId
        // For now, this is a placeholder
        updateParams.items = [
          {
            id: subscriptionItemId,
            price: updates.planId, // This should be a Stripe price ID
          },
        ];
      }
    }

    return stripe.subscriptions.update(subscriptionId, updateParams);
  },

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd = true,
  ): Promise<Stripe.Subscription> {
    if (!stripe) {
      throw new Error("Stripe is not configured");
    }

    if (cancelAtPeriodEnd) {
      return stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }

    return stripe.subscriptions.cancel(subscriptionId);
  },

  /**
   * Create a payment method
   */
  async createPaymentMethod(
    paymentMethodId: string,
    customerId: string,
    setAsDefault = false,
  ): Promise<Stripe.PaymentMethod> {
    if (!stripe) {
      throw new Error("Stripe is not configured");
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Set as default if requested
    if (setAsDefault) {
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    }

    return stripe.paymentMethods.retrieve(paymentMethodId);
  },

  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    metadata?: Record<string, string>,
  ): Promise<Stripe.Checkout.Session> {
    if (!stripe) {
      throw new Error("Stripe is not configured");
    }

    return stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    });
  },

  /**
   * Create a billing portal session
   */
  async createBillingPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<Stripe.BillingPortal.Session> {
    if (!stripe) {
      throw new Error("Stripe is not configured");
    }

    return stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  },
};
