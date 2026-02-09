# @raypx/payments

Payment processing and management utilities for Raypx.

## Features

- Type-safe payment data structures
- Payment provider interface
- Support for multiple payment methods
- Webhook verification utilities

## Installation

```bash
pnpm add @raypx/payments
```

## Usage

### Basic Types

```typescript
import { PaymentData, PaymentStatus, PaymentMethod } from "@raypx/payments";

const payment: PaymentData = {
  id: "pay_123",
  amount: {
    amount: 1000,
    currency: "USD",
  },
  status: "succeeded",
  method: "card",
  createdAt: new Date(),
  updatedAt: new Date(),
};
```

### Payment Provider

```typescript
import { BasePaymentProvider } from "@raypx/payments";

class MyPaymentProvider extends BasePaymentProvider {
  async createPayment(request: CreatePaymentRequest): Promise<PaymentData> {
    // Implementation
  }
  
  // ... other methods
}
```

## Development

```bash
# Build
pnpm build

# Test
pnpm test

# Type check
pnpm typecheck
```

