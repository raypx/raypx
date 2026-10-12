import postgres from "postgres";
/** Optional duplicate-identity guard. Execution ownership is fenced by each Run's expiring lease. */
export async function acquireCloudWorkerLease(
  databaseUrl: string,
  ownerId: string,
  onLost?: (error: Error) => void,
): Promise<{ close(): Promise<void> }> {
  const client = postgres(databaseUrl, { max: 1, idle_timeout: 0, max_lifetime: 0 });
  const session = await client.reserve();
  let closing = false;
  let lost = false;
  const lock = await session<
    { locked: boolean }[]
  >`select pg_try_advisory_lock(hashtextextended(${`voidmix:cloud-worker:identity:${ownerId}`},0)) as locked`;
  if (!lock[0]?.locked) {
    session.release();
    await client.end();
    throw new Error(`Cloud worker identity is already owned; ${ownerId} cannot start.`);
  }
  const connection = await session<{ pid: number }[]>`select pg_backend_pid() as pid`;
  const originalPid = connection[0]?.pid;
  const heartbeat = setInterval(() => {
    void session<{ pid: number }[]>`select pg_backend_pid() as pid`
      .then((rows) => {
        if (rows[0]?.pid !== originalPid) throw new Error("Cloud worker lease connection changed.");
      })
      .catch((error: unknown) => {
        if (!closing && !lost) {
          lost = true;
          onLost?.(error instanceof Error ? error : new Error("Cloud worker lease was lost."));
        }
      });
  }, 5_000);
  heartbeat.unref();
  return {
    async close() {
      closing = true;
      clearInterval(heartbeat);
      try {
        if (!lost)
          await session`select pg_advisory_unlock(hashtextextended(${`voidmix:cloud-worker:identity:${ownerId}`},0))`;
      } finally {
        session.release();
        await client.end();
      }
    },
  };
}
