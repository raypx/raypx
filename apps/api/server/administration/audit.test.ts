import { expect, it, vi } from "vite-plus/test";
import { AuditService, AuditUnavailable } from "./audit.ts";
const intent = {
  action: "configuration.update" as const,
  actorId: "actor",
  source: "http" as const,
  requestId: "server-request",
};
function fixture() {
  const journal = { begin: vi.fn(async () => crypto.randomUUID()), finish: vi.fn(async () => {}) };
  return { journal, audit: new AuditService(journal) };
}
it("blocks actions when durable intent fails and keeps concurrent actor scopes isolated", async () => {
  const { journal, audit } = fixture();
  const change = vi.fn();
  journal.begin.mockRejectedValueOnce(new Error("storage unavailable"));
  await expect(audit.run(intent, change)).rejects.toBeInstanceOf(AuditUnavailable);
  expect(change).not.toHaveBeenCalled();
  const seen = await Promise.all(
    ["one", "two"].map((actorId) =>
      audit.run({ ...intent, actorId }, async () => {
        await Promise.resolve();
        const scope = audit.current()!;
        scope.committed = true;
        return scope.actorId;
      }),
    ),
  );
  expect(seen).toEqual(["one", "two"]);
  expect(audit.current()).toBeUndefined();
});
it("does not turn committed writes into failures when response delivery fails", async () => {
  const { journal, audit } = fixture();
  await expect(
    audit.run(intent, async () => {
      audit.current()!.committed = true;
      throw new Error("response failed");
    }),
  ).rejects.toThrow("response failed");
  expect(journal.finish).not.toHaveBeenCalled();
});
it("keeps timed-out, still-running transactions unconfirmed and records known refusals", async () => {
  const { journal, audit } = fixture();
  await audit.run(intent, async () => {
    audit.current()!.mutationStarted = true;
    return new Response(null, { status: 503 });
  });
  expect(journal.finish).not.toHaveBeenCalled();
  await audit.run(intent, async () => new Response(null, { status: 403 }));
  expect(journal.finish).toHaveBeenLastCalledWith(expect.any(String), "rejected", "HTTP_403");
});
it("deduplicates nested service scopes and refuses mismatched actors", async () => {
  const { journal, audit } = fixture();
  await audit.run(intent, async () => {
    await expect(audit.run({ ...intent, actorId: "other" }, async () => {})).rejects.toBeInstanceOf(
      AuditUnavailable,
    );
    audit.current()!.committed = true;
    await audit.run(intent, async () => {});
  });
  expect(journal.begin).toHaveBeenCalledTimes(1);
});
