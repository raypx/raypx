/** @vitest-environment happy-dom */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import type { RootGrant } from "@raypx/contracts/local";
import { rememberProject } from "./features/tasks/project-history.ts";
import {
  mocks,
  grants,
  deferred,
  testRouter,
  mount,
  page,
} from "../tests/helpers/router-local.tsx";

describe("Desktop local file routes", () => {
  it("prefills the terminal from the current project without starting it and retains revoked targets", async () => {
    rememberProject("work");
    const recent = testRouter("/terminal");
    await recent.load();
    expect(recent.state.matches.find((match) => match.routeId === "/terminal")?.loaderData).toEqual(
      { project: "work", cwd: "/work" },
    );
    const unavailable = testRouter("/terminal?project=revoked");
    await unavailable.load();
    expect(
      unavailable.state.matches.find((match) => match.routeId === "/terminal")?.loaderData,
    ).toEqual({ project: "revoked", cwd: "" });
    expect(mocks.localRequest.mock.calls.some(([method]) => method === "terminal.open")).toBe(
      false,
    );
  });

  it.each(["/", "/automations"])(
    "keeps %s usable as a preview without RPC or redirects",
    async (url) => {
      mocks.isDesktop.mockReturnValue(false);
      const router = await page(url);
      expect(router.state.location.pathname).toBe(url);
      expect(screen.getByText("Open the desktop app to use local tools.")).toBeTruthy();
      expect(mocks.localRequest).not.toHaveBeenCalled();
      expect(screen.queryByLabelText("Password")).toBeNull();
    },
  );

  it("does not start native jobs requests while preloading navigation", async () => {
    const router = testRouter("/login");
    await router.load();
    await router.preloadRoute({ to: "/automations" });
    expect(router.state.location.pathname).toBe("/login");
    expect(mocks.localRequest).not.toHaveBeenCalled();
  });

  it.each([
    {
      destination: "/files" as const,
      otherDestination: "/automations" as const,
      assertAuthorizedPage: async () => {
        expect(await screen.findByText("This folder is empty.")).toBeTruthy();
        expect(mocks.localRequest).toHaveBeenCalledWith("files.list", {
          rootId: "work",
          path: "",
          offset: 0,
          limit: 100,
        });
      },
    },
    {
      destination: "/automations" as const,
      otherDestination: "/files" as const,
      assertAuthorizedPage: async () => {
        fireEvent.click(await screen.findByRole("button", { name: "New automation" }));
        await waitFor(() =>
          expect(screen.getByRole("combobox", { name: "Folder" })).toHaveTextContent("Work"),
        );
      },
    },
  ])(
    "refreshes shared roots when re-entering $destination and reuses them between local pages",
    async ({ destination, otherDestination, assertAuthorizedPage }) => {
      const updatedRoots = deferred<RootGrant[]>();
      let authorized = false;
      mocks.localRequest.mockImplementation(async (method) => {
        if (method.startsWith("instance.")) return { state: "registered" };
        if (method === "roots.list") return authorized ? updatedRoots.promise : [];
        if (method === "jobs.list") return [];
        if (method === "files.list") return { entries: [], total: 0, offset: 0 };
        throw new Error(`Unexpected local request: ${method}`);
      });
      const router = testRouter("/files", { browser: true });
      await router.load();
      await act(async () => {
        mount(router);
      });
      expect(await screen.findByRole("heading", { name: "Start on this computer" })).toBeTruthy();
      const rootReads = () =>
        mocks.localRequest.mock.calls.filter(([method]) => method === "roots.list").length;
      expect(rootReads()).toBe(1);

      await act(async () => router.navigate({ to: "/login" }));
      authorized = true;
      await act(async () => {
        void router.navigate({ to: destination });
      });
      await waitFor(() => expect(rootReads()).toBe(2));
      expect(mocks.localRequest.mock.calls.some(([method]) => method === "files.list")).toBe(false);
      await act(async () => updatedRoots.resolve(grants));

      await assertAuthorizedPage();

      await act(async () => router.navigate({ to: otherDestination }));
      await act(async () => router.navigate({ to: destination }));
      expect(rootReads()).toBe(2);
    },
  );

  it.each([false, true])(
    "skips native capability and IPC while server-loading local routes (shell=%s)",
    async (isShell) => {
      mocks.isDesktop.mockImplementation(() => {
        throw new Error("Native capability must not run during server loading");
      });
      const router = testRouter("/automations", { isServer: true, isShell });
      await router.load();
      expect(router.state.matches.some((match) => match.routeId === "/(local)/automations")).toBe(
        true,
      );
      expect(mocks.isDesktop).not.toHaveBeenCalled();
      expect(mocks.localRequest).not.toHaveBeenCalled();
    },
  );
});
