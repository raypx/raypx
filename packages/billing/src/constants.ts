import type { Plan } from "./types";

/**
 * Available subscription plans
 */
export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 0,
    currency: "USD",
    interval: "forever",
    description: "Perfect for trying out",
    features: ["Up to 5 team members", "10 GB storage", "Basic support", "API access"],
    limits: {
      teamMembers: 5,
      storageGB: 10,
      apiCalls: 10000,
    },
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    currency: "USD",
    interval: "month",
    description: "For growing teams",
    features: [
      "Up to 20 team members",
      "100 GB storage",
      "Priority support",
      "Advanced API access",
      "Custom integrations",
    ],
    limits: {
      teamMembers: 20,
      storageGB: 100,
      apiCalls: 1000000,
    },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: null, // Custom pricing
    currency: "USD",
    interval: "month",
    description: "For large organizations",
    features: [
      "Unlimited team members",
      "Unlimited storage",
      "24/7 dedicated support",
      "Enterprise API access",
      "Custom integrations",
      "SLA guarantee",
      "On-premise deployment",
    ],
    limits: {
      teamMembers: Infinity,
      storageGB: Infinity,
      apiCalls: Infinity,
    },
  },
];

/**
 * Get plan by ID
 */
export function getPlanById(planId: string): Plan | undefined {
  return PLANS.find((plan) => plan.id === planId);
}

/**
 * Format plan price
 */
export function formatPlanPrice(plan: Plan): string {
  if (plan.price === null) {
    return "Custom";
  }
  if (plan.price === 0) {
    return "$0";
  }
  return `$${plan.price}`;
}

/**
 * Format plan period
 */
export function formatPlanPeriod(plan: Plan): string {
  if (plan.interval === "forever") {
    return "forever";
  }
  if (plan.interval === "month") {
    return "per month";
  }
  if (plan.interval === "year") {
    return "per year";
  }
  return "";
}
