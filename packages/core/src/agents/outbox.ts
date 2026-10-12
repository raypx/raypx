export interface OutboxEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface OutboxRepository {
  claim(input: { workerId: string; limit: number; leaseMs: number }): Promise<OutboxEvent[]>;
  acknowledge(input: { id: string; workerId: string }): Promise<void>;
  release(input: { id: string; workerId: string }): Promise<void>;
}
