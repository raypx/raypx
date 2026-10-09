import { createLogger, type Logger } from "@raypx/logger";

export interface RuntimeResource {
  name: string;
  required?: boolean;
  check?(signal: AbortSignal): void | Promise<void>;
  dispose?(signal: AbortSignal): void | Promise<void>;
}
export interface Readiness {
  status: "ok" | "unavailable";
  checks: Record<string, "ok" | "failed">;
}

async function bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}

/** Tracks only resources actually created by the application. */
export class RuntimeLifecycle {
  private resources = new Map<string, RuntimeResource>();
  private ready = false;
  private draining = false;
  private closePromise: Promise<void> | undefined;
  constructor(
    private readonly logger: Logger = createLogger({ name: "runtime" }),
    private readonly timeoutMs = 3000,
  ) {}

  register(resource: RuntimeResource): void {
    if (this.draining) throw new Error("Cannot register a resource during shutdown");
    if (this.resources.has(resource.name))
      throw new Error(`Resource already registered: ${resource.name}`);
    this.resources.set(resource.name, resource);
  }
  markReady(): void {
    if (!this.draining) this.ready = true;
  }
  markDraining(): void {
    this.draining = true;
    this.ready = false;
  }

  async checkReadiness(): Promise<Readiness> {
    const checks: Readiness["checks"] = {};
    if (!this.ready || this.draining) return { status: "unavailable", checks };
    let requiredFailure = false;
    await Promise.all(
      [...this.resources.values()].map(async (resource) => {
        if (!resource.check) return;
        try {
          const signal = AbortSignal.timeout(this.timeoutMs);
          await bounded(
            Promise.resolve().then(() => resource.check?.(signal)),
            signal,
          );
          checks[resource.name] = "ok";
        } catch (error) {
          checks[resource.name] = "failed";
          if (resource.required !== false) requiredFailure = true;
          this.logger.warn("Resource check failed", { resource: resource.name, error });
        }
      }),
    );
    return { status: requiredFailure || this.draining ? "unavailable" : "ok", checks };
  }

  /** Releases resources in reverse creation order, once, within one total deadline. */
  dispose(): Promise<void> {
    this.markDraining();
    this.closePromise ??= this.close();
    return this.closePromise;
  }
  private async close(): Promise<void> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    for (const resource of [...this.resources.values()].reverse()) {
      if (signal.aborted) break;
      if (!resource.dispose) continue;
      try {
        await bounded(
          Promise.resolve().then(() => resource.dispose?.(signal)),
          signal,
        );
      } catch (error) {
        this.logger.error("Resource close failed", { resource: resource.name, error });
      }
    }
    this.resources.clear();
    this.logger.info("Runtime stopped");
  }
}
