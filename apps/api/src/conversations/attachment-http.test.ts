import { expect, it, vi } from "vitest";
import { createAttachmentDownloadRoutes, attachmentDownloadHeaders } from "./attachment-http.js";
import { SpaceNotFound } from "@raypx/core/spaces";
it("forces safe private downloads and rechecks the session and Space before every read", async () => {
  const id = crypto.randomUUID(),
    name = '报告 "x".txt';
  const readSession = vi.fn(async () => ({ user: { id: "member" } }));
  const resolve = vi.fn(async () => ({ spaceId: "space" }));
  const download = vi.fn(async () => ({
    attachment: { name },
    bytes: btoa("<script>inert data</script>"),
  }));
  const app = createAttachmentDownloadRoutes({
    readSession,
    spaces: { resolve },
    messageAttachments: { download },
  } as unknown as Parameters<typeof createAttachmentDownloadRoutes>[0]);
  const path = `/space/conversation/${id}`;
  const response = await app.request(path);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/octet-stream");
  expect(response.headers.get("content-disposition")).toContain("attachment;");
  expect(response.headers.get("content-disposition")).not.toContain(name);
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.text()).toBe("<script>inert data</script>");
  resolve.mockRejectedValueOnce(new SpaceNotFound());
  expect((await app.request(path)).status).toBe(404);
  expect(download).toHaveBeenCalledTimes(1);
  readSession.mockResolvedValueOnce(null as never);
  expect((await app.request(path)).status).toBe(401);
  expect(attachmentDownloadHeaders("a\r\nb.txt").get("content-disposition")).not.toContain("\r");
});
