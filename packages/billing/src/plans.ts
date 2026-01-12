// Default subscription plans
export const PLANS = {
  FREE: {
    id: "free",
    name: "Free",
    description: "Get started with basic features",
    features: ["Up to 3 team members", "Basic analytics", "Community support", "1GB storage"],
    limits: {
      teamMembers: 3,
      storageGb: 1,
      apiCalls: 1000,
    },
  },
  PRO: {
    id: "pro",
    name: "Pro",
    description: "For growing teams and businesses",
    features: [
      "Up to 10 team members",
      "Advanced analytics",
      "Priority support",
      "10GB storage",
      "API access",
      "Custom integrations",
    ],
    limits: {
      teamMembers: 10,
      storageGb: 10,
      apiCalls: 10000,
    },
  },
  ENTERPRISE: {
    id: "enterprise",
    name: "Enterprise",
    description: "For large organizations with custom needs",
    features: [
      "Unlimited team members",
      "Enterprise analytics",
      "24/7 dedicated support",
      "Unlimited storage",
      "Full API access",
      "Custom integrations",
      "SSO & SAML",
      "Audit logs",
      "SLA guarantee",
    ],
    limits: {
      teamMembers: -1, // unlimited
      storageGb: -1, // unlimited
      apiCalls: -1, // unlimited
    },
  },
} as const;

export type PlanId = keyof typeof PLANS;
export type Plan = (typeof PLANS)[PlanId];
