import { expect, it, vi } from "vite-plus/test";
import { ApprovalLease } from "../../native/approval-lease";
it("renews only a visible ready surface and releases on minimize, hide and quit", async () => {
  const request = vi.fn(async (_active: boolean) => true),
    lease = new ApprovalLease(request);
  await lease.update(false, true, false);
  expect(request).not.toHaveBeenCalled();
  await lease.update(true, true, false);
  await lease.update(true, true, false);
  await lease.update(true, true, true);
  await lease.update(true, true, false);
  await lease.update(true, false, false);
  await lease.update(true, true, false);
  await lease.stop();
  await lease.update(true, true, false);
  expect(request.mock.calls.map(([active]) => active)).toEqual([
    true,
    true,
    false,
    true,
    false,
    true,
    false,
  ]);
});
