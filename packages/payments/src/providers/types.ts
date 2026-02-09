import type { PaymentAmount, PaymentData, PaymentMetadata } from "../types";

/**
 * Payment provider configuration
 */
export interface PaymentProviderConfig {
  apiKey: string;
  apiSecret?: string;
  environment?: "sandbox" | "production";
  [key: string]: unknown;
}

/**
 * Create payment request
 */
export interface CreatePaymentRequest {
  amount: PaymentAmount;
  method: string;
  metadata?: PaymentMetadata;
  returnUrl?: string;
  cancelUrl?: string;
}

/**
 * Payment provider interface
 */
export interface PaymentProvider {
  /**
   * Create a new payment
   */
  createPayment(request: CreatePaymentRequest): Promise<PaymentData>;

  /**
   * Get payment by ID
   */
  getPayment(id: string): Promise<PaymentData | null>;

  /**
   * Update payment status
   */
  updatePaymentStatus(id: string, status: PaymentData["status"]): Promise<PaymentData>;

  /**
   * Refund a payment
   */
  refundPayment(id: string, amount?: PaymentAmount): Promise<PaymentData>;

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string | Buffer, signature: string): Promise<boolean>;
}
