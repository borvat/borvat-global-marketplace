/**
 * Payment provider boundary.
 *
 * The marketplace never talks to a card network directly and never stores card data.
 * A licensed provider is called behind this interface. The sandbox implementation
 * below is deterministic, so order behaviour can be tested without real money.
 * Swapping in a real provider means implementing the same interface.
 */

export interface PaymentIntent {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly idempotencyKey: string;
  readonly market: string;
}

export interface PaymentResult {
  readonly providerRef: string;
  readonly status: 'CAPTURED' | 'FAILED';
  readonly failureReason?: string;
}

export interface PaymentProvider {
  readonly name: string;
  capture(intent: PaymentIntent): Promise<PaymentResult>;
}

export interface SandboxOptions {
  /** Refuse any capture at or above this amount, to test failure handling. */
  readonly declineAtOrAboveMinor?: bigint;
  /** Force a failure regardless of amount. */
  readonly alwaysDecline?: boolean;
}

export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'sandbox';
  private readonly options: SandboxOptions;

  constructor(options: SandboxOptions = {}) {
    this.options = options;
  }

  async capture(intent: PaymentIntent): Promise<PaymentResult> {
    if (this.options.alwaysDecline === true) {
      return { providerRef: `sbx_declined_${intent.idempotencyKey.slice(0, 12)}`, status: 'FAILED', failureReason: 'card_declined' };
    }
    const limit = this.options.declineAtOrAboveMinor;
    if (limit !== undefined && intent.amountMinor >= limit) {
      return { providerRef: `sbx_declined_${intent.idempotencyKey.slice(0, 12)}`, status: 'FAILED', failureReason: 'amount_limit_exceeded' };
    }
    return {
      providerRef: `sbx_${intent.orderNumber.toLowerCase()}`,
      status: 'CAPTURED',
    };
  }
}