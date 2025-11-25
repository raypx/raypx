# @raypx/billing

Billing and subscription management package with Stripe integration.

## Features

- ✅ Stripe integration for payments
- ✅ Subscription management
- ✅ Invoice handling
- ✅ Payment method management
- ✅ Webhook handling
- ✅ Type-safe APIs

## Installation

This package is part of the Raypx monorepo and is automatically available to other packages.

## Setup

### 1. Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Stripe API Keys (get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Stripe Webhook Secret (get from https://dashboard.stripe.com/webhooks)
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 2. Stripe Dashboard Setup

1. **Create Products and Prices**
   - Go to Stripe Dashboard → Products
   - Create products for each plan (Starter, Pro, Enterprise)
   - Create recurring prices for each product
   - Note the Price IDs (e.g., `price_1234567890`)

2. **Configure Webhooks**
   - Go to Stripe Dashboard → Developers → Webhooks
   - Add endpoint: `https://yourdomain.com/api/billing/webhook`
   - Select events to listen to:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`
     - `payment_method.attached`
   - Copy the webhook signing secret

3. **Enable Billing Portal** (optional)
   - Go to Stripe Dashboard → Settings → Billing → Customer portal
   - Configure portal settings
   - Enable features you want customers to access

## Usage

### In tRPC Router

```typescript
import { billingRouter } from "@raypx/trpc/src/routers/billing";

// The router is already included in the main router
// Access via: trpc.billing.getSubscription.useQuery(...)
```

### Create Checkout Session

```typescript
const { data } = await trpc.billing.createCheckoutSession.mutate({
  organizationId: "org_123",
  priceId: "price_1234567890", // Stripe Price ID
  successUrl: "https://yourapp.com/billing/success",
  cancelUrl: "https://yourapp.com/billing",
});

// Redirect user to data.url
window.location.href = data.url;
```

### Create Billing Portal Session

```typescript
const { data } = await trpc.billing.createBillingPortalSession.mutate({
  organizationId: "org_123",
  returnUrl: "https://yourapp.com/billing",
});

// Redirect user to data.url
window.location.href = data.url;
```

### Update Subscription

```typescript
await trpc.billing.updateSubscription.mutate({
  organizationId: "org_123",
  planId: "pro",
  cancelAtPeriodEnd: false,
});
```

### Cancel Subscription

```typescript
await trpc.billing.cancelSubscription.mutate({
  organizationId: "org_123",
  cancelAtPeriodEnd: true, // Cancel at end of billing period
});
```

## Database Schema

The package uses the following database tables (defined in `@raypx/database`):

- `subscription` - Organization subscriptions
- `invoice` - Billing invoices
- `payment_method` - Payment methods

## Webhook Handling

Webhooks are automatically handled at `/api/billing/webhook`. The webhook handler:

1. Verifies the Stripe signature
2. Processes the event
3. Syncs data to the database

## API Reference

### Types

```typescript
import type { Plan, Subscription, Invoice, PaymentMethod } from "@raypx/billing";
```

### Constants

```typescript
import { PLANS, getPlanById, formatPlanPrice } from "@raypx/billing";
```

### Stripe Utilities

```typescript
import { stripeUtils, isStripeConfigured } from "@raypx/billing";

// Check if Stripe is configured
if (isStripeConfigured()) {
  // Use Stripe features
}
```

## Testing

For testing, you can use Stripe's test mode:

1. Use test API keys (`sk_test_...`, `pk_test_...`)
2. Use Stripe CLI to forward webhooks: `stripe listen --forward-to localhost:3000/api/billing/webhook`
3. Use test card numbers from Stripe documentation

## Production Checklist

- [ ] Set up Stripe products and prices
- [ ] Configure webhook endpoint in Stripe Dashboard
- [ ] Set production API keys
- [ ] Test checkout flow
- [ ] Test subscription updates
- [ ] Test webhook handling
- [ ] Set up billing portal (optional)
- [ ] Configure email notifications in Stripe

## Resources

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe API Reference](https://stripe.com/docs/api)
- [Stripe Testing](https://stripe.com/docs/testing)

