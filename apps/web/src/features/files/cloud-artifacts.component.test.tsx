/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ApiClient } from "@voidmix/client";
import type { CloudAssetVersionDto } from "@voidmix/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { createFileContentCache } from "./content-cache";

const mocks = vi.hoisted(() => ({
  cache: null as unknown as ReturnType<typeof createFileContentCache>,
  resources: { files: null as unknown as ReturnType<typeof createFileContentCache> },
}));
vi.mock("../../i18n/client", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../../lib/use-cloud-queries", () => ({
  useCloudQueries: () => ({
    identity: { accountId: "account" },
    resources: mocks.resources,
    queries: {
      asset: (id: string) => ({
        queryKey: ["file", id],
        queryFn: async () => asset(id),
        staleTime: 60_000,
      }),
    },
  }),
}));
vi.mock("@voidmix/agent-ui/artifacts", () => ({
  ArtifactList: ({
    artifacts,
    onSelect,
  }: {
    artifacts: { id: string; name: string }[];
    onSelect: (file: { id: string; name: string }) => void;
  }) => (
    <div>
      {artifacts.map((file) => (
        <button key={file.id} onClick={() => onSelect(file)}>
          {file.name}
        </button>
      ))}
    </div>
  ),
  ArtifactPreview: ({ name, content }: { name: string; content?: { text?: string } }) => (
    <section aria-label={name}>{content?.text}</section>
  ),
}));
import { CloudArtifacts } from "./cloud-artifacts";
function asset(id: string): CloudAssetVersionDto {
  return {
    id,
    name: id,
    mediaType: "text/plain",
    byteSize: 10,
    createdAt: new Date(),
    scope: { type: "personal", ownerUserId: "account" },
  } as CloudAssetVersionDto;
}
function signed(id: string) {
  return {
    asset: asset(id),
    download: {
      url: `https://files.invalid/${id}`,
      method: "GET" as const,
      headers: {},
      expiresAt: new Date(Date.now() + 60_000),
    },
  };
}
let queryClient: QueryClient;
beforeEach(() => {
  queryClient = new QueryClient();
  mocks.cache = createFileContentCache();
  mocks.resources.files = mocks.cache;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      blob: async () => ({ size: 10, text: async () => `${url.split("/").at(-1)}-content` }),
    })),
  );
});
afterEach(() => {
  cleanup();
  mocks.cache.disposeAccount("account");
  queryClient.clear();
  vi.unstubAllGlobals();
});
it("does not redownload the same immutable version when streaming recreates artifact DTOs", async () => {
  const preview = vi.fn(async () => signed("version-1"));
  const api = { cloud: { assets: { preview } } } as unknown as ApiClient;
  const view = (files: CloudAssetVersionDto[]) => (
    <QueryClientProvider client={queryClient}>
      <CloudArtifacts api={api} artifacts={files} />
    </QueryClientProvider>
  );
  const { rerender } = render(view([asset("version-1")]));
  fireEvent.click(screen.getByRole("button", { name: "version-1" }));
  await screen.findByText("version-1-content");
  rerender(view([asset("version-1")]));
  await waitFor(() => expect(preview).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenCalledOnce();
});
it("never shows an older preview under the newly selected version", async () => {
  let complete!: (value: ReturnType<typeof signed>) => void;
  const old = new Promise<ReturnType<typeof signed>>((resolve) => {
    complete = resolve;
  });
  const preview = vi.fn(({ assetVersionId }: { assetVersionId: string }) =>
    assetVersionId === "version-1" ? old : Promise.resolve(signed("version-2")),
  );
  const api = { cloud: { assets: { preview } } } as unknown as ApiClient;
  render(
    <QueryClientProvider client={queryClient}>
      <CloudArtifacts api={api} artifacts={[asset("version-1"), asset("version-2")]} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "version-1" }));
  fireEvent.click(screen.getByRole("button", { name: "version-2" }));
  await screen.findByText("version-2-content");
  complete(signed("version-1"));
  await old;
  await Promise.resolve();
  expect(screen.queryByText("version-1-content")).toBeNull();
});
