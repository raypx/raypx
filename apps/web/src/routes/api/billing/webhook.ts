import { handleStripeWebhook, verifyWebhookSignature } from "@raypx/billing";
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

/**
 * Stripe webhook endpoint
 * Handles Stripe webhook events for billing
 */
async function handler({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const body = await request.text();
  const event = verifyWebhookSignature(body, signature);

  if (!event) {
    return json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handleStripeWebhook(event);
    return json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/billing/webhook")({
  server: {
    handlers: {
      POST: handler,
    },
  },
});
