export interface OutboxEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface OutboxClaim extends OutboxEvent {
  attempts: number;
}

export interface OutboxLease {
  id: string;
  workerId: string;
  attempts: number;
}

export interface OutboxRepository {
  claim(input: { workerId: string; limit: number; leaseMs: number }): Promise<OutboxClaim[]>;
  acknowledge(input: OutboxLease): Promise<void>;
  release(input: OutboxLease & { retryDelayMs: number }): Promise<void>;
}
