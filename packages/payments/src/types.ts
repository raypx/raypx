import { z } from "zod";

/**
 * Payment status
 */
export const PaymentStatus = z.enum([
  "pending",
  "processing",
  "succeeded",
  "failed",
  "canceled",
  "refunded",
]);

export type PaymentStatus = z.infer<typeof PaymentStatus>;

/**
 * Payment method
 */
export const PaymentMethod = z.enum(["card", "bank_transfer", "wallet", "crypto", "other"]);

export type PaymentMethod = z.infer<typeof PaymentMethod>;

/**
 * Payment currency
 */
export const PaymentCurrency = z.enum(["USD", "EUR", "CNY", "JPY", "GBP"]);

export type PaymentCurrency = z.infer<typeof PaymentCurrency>;

/**
 * Payment amount
 */
export const PaymentAmount = z.object({
  amount: z.number().positive(),
  currency: PaymentCurrency,
});

export type PaymentAmount = z.infer<typeof PaymentAmount>;

/**
 * Payment metadata
 */
export const PaymentMetadata = z.record(z.string(), z.unknown()).optional();

export type PaymentMetadata = z.infer<typeof PaymentMetadata>;

/**
 * Base payment data
 */
export const PaymentData = z.object({
  id: z.string(),
  amount: PaymentAmount,
  status: PaymentStatus,
  method: PaymentMethod,
  metadata: PaymentMetadata,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PaymentData = z.infer<typeof PaymentData>;
