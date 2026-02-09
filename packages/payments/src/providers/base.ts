import type { PaymentAmount, PaymentData } from "../types";
import type { CreatePaymentRequest, PaymentProvider, PaymentProviderConfig } from "./types";

/**
 * Base payment provider implementation
 *
 * This is an abstract base class that payment providers can extend
 */
export abstract class BasePaymentProvider implements PaymentProvider {
  protected config: PaymentProviderConfig;

  constructor(config: PaymentProviderConfig) {
    this.config = config;
  }

  /**
   * Create a new payment
   * Must be implemented by subclasses
   */
  abstract createPayment(request: CreatePaymentRequest): Promise<PaymentData>;

  /**
   * Get payment by ID
   * Must be implemented by subclasses
   */
  abstract getPayment(id: string): Promise<PaymentData | null>;

  /**
   * Update payment status
   * Must be implemented by subclasses
   */
  abstract updatePaymentStatus(id: string, status: PaymentData["status"]): Promise<PaymentData>;

  /**
   * Refund a payment
   * Must be implemented by subclasses
   */
  abstract refundPayment(id: string, amount?: PaymentAmount): Promise<PaymentData>;

  /**
   * Verify webhook signature
   * Must be implemented by subclasses
   */
  abstract verifyWebhook(payload: string | Buffer, signature: string): Promise<boolean>;

  /**
   * Get provider name
   */
  abstract getProviderName(): string;
}
