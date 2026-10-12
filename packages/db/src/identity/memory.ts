import type {
  AuditEvent,
  User,
  UserListQuery,
  UserPage,
  UserRepository,
  UserStatus,
} from "@voidmix/core";

export class InMemoryUserRepository implements UserRepository {
  private administrationQueue: Promise<void> = Promise.resolve();
  readonly users = new Map<string, User>();
  readonly auditEvents: AuditEvent[] = [];

  constructor(seed: readonly User[] = []) {
    for (const user of seed) this.users.set(user.id, { ...user });
  }

  async runAdministration<T>(operation: (users: UserRepository) => Promise<T>): Promise<T> {
    const previous = this.administrationQueue;
    let release!: () => void;
    this.administrationQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    // Preserve injected/subclass repository behavior (including failing audit
    // sinks), while keeping uncommitted user state invisible to ordinary reads.
    const tx: InMemoryUserRepository = Object.assign(
      Object.create(Object.getPrototypeOf(this)),
      this,
      {
        users: new Map([...this.users].map(([id, user]) => [id, { ...user }])),
        auditEvents: [],
      },
    );
    try {
      const result = await operation(tx);
      this.users.clear();
      for (const [id, user] of tx.users) this.users.set(id, { ...user });
      this.auditEvents.push(
        ...tx.auditEvents.map((event) => ({ ...event, metadata: { ...event.metadata } })),
      );
      return result;
    } finally {
      release();
    }
  }

  async list(query: UserListQuery): Promise<UserPage> {
    const normalizedQuery = query.query?.toLowerCase();
    const offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
    const matches = [...this.users.values()]
      .filter(
        (user) =>
          (!query.role || user.role === query.role) &&
          (!query.status || user.status === query.status),
      )
      .filter(
        (user) =>
          !normalizedQuery ||
          user.email.toLowerCase().includes(normalizedQuery) ||
          user.displayName.toLowerCase().includes(normalizedQuery),
      )
      .sort(
        (left, right) =>
          right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id),
      );
    const items = matches.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;
    return {
      items: items.map((user) => ({ ...user })),
      total: matches.length,
      nextCursor: nextOffset < matches.length ? String(nextOffset) : null,
    };
  }

  async getById(id: string): Promise<User | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  async getByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase();
    const user = [...this.users.values()].find(
      (candidate) => candidate.email.toLowerCase() === normalized,
    );
    return user ? { ...user } : null;
  }

  async countActiveAdministrators(): Promise<number> {
    return [...this.users.values()].filter(
      (user) => user.status === "active" && (user.role === "admin" || user.role === "owner"),
    ).length;
  }

  async save(user: User): Promise<void> {
    this.users.set(user.id, { ...user, email: user.email.toLowerCase() });
  }

  async updateStatus(id: string, status: UserStatus): Promise<User> {
    const existing = this.users.get(id);
    if (!existing) throw new Error(`Cannot update missing user ${id}`);
    const updated = { ...existing, status };
    this.users.set(id, updated);
    return { ...updated };
  }

  async appendAudit(event: AuditEvent): Promise<void> {
    this.auditEvents.push({ ...event, metadata: { ...event.metadata } });
  }

  async listAudit(limit: number): Promise<AuditEvent[]> {
    return [...this.auditEvents]
      .sort(
        (left, right) =>
          right.occurredAt.getTime() - left.occurredAt.getTime() || right.id.localeCompare(left.id),
      )
      .slice(0, limit)
      .map((event) => ({ ...event, metadata: { ...event.metadata } }));
  }
}
