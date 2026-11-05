/** @vitest-environment happy-dom */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { mocks, page } from "../tests/helpers/router-auth.tsx";

describe("authentication routes", () => {
  it("lets guests compose without reading private data", async () => {
    const router = await page("/tasks");
    expect(router.state.location.pathname).toBe("/tasks");
    expect(await screen.findByRole("button", { name: "Sign in to send" })).toBeTruthy();
    expect(mocks.tasks).not.toHaveBeenCalled();
    expect(mocks.devices).not.toHaveBeenCalled();
    expect(mocks.approvals).not.toHaveBeenCalled();
  });

  it("keeps application routes when the API is unavailable", async () => {
    mocks.loadAccount.mockResolvedValue({ status: "unavailable" });
    const router = await page("/projects");
    expect(router.state.location.pathname).toBe("/projects");
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it.each(["/tasks", "/approvals", "/settings"])(
    "keeps session failures retryable on %s without private reads",
    async (path) => {
      mocks.sessionError = true;
      await page(path);
      fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
      expect(mocks.refetch).toHaveBeenCalledTimes(1);
      expect(mocks.tasks).not.toHaveBeenCalled();
      expect(mocks.devices).not.toHaveBeenCalled();
      expect(mocks.approvals).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Sign in to send" })).toBeNull();
    },
  );

  it("waits for session resolution before mounting private task queries", async () => {
    mocks.sessionPending = true;
    await page("/tasks");
    expect(mocks.tasks).not.toHaveBeenCalled();
    expect(mocks.devices).not.toHaveBeenCalled();
    expect(mocks.approvals).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Sign in to send" })).toBeNull();
  });

  it("returns to the guest editor with the draft after cancelling login", async () => {
    const router = await page("/tasks?from=cancel");
    fireEvent.change(await screen.findByLabelText("What should the agent do?"), {
      target: { value: "Do not lose this draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in to send" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    fireEvent.click(screen.getByRole("link", { name: "Back to browsing" }));
    await waitFor(() =>
      expect(screen.getByLabelText("What should the agent do?")).toHaveValue(
        "Do not lose this draft",
      ),
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("opens projects after successful sign-in without a return destination", async () => {
    mocks.signIn.mockImplementation(async () => {
      mocks.session = {
        user: { id: "user-1", name: "Ada", email: "ada@example.test" },
        session: { id: "session-1" },
      };
      mocks.loadAccount.mockResolvedValue({
        status: "signed-in",
        account: { id: "user-1", email: "ada@example.test", name: "Ada" },
      });
      return { data: {}, error: null };
    });
    const router = await page("/login");
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects"));
    await waitFor(() => expect(screen.queryByLabelText("Password")).toBeNull());
  });

  it("retries a failed session refresh after login without submitting credentials again", async () => {
    mocks.signIn.mockImplementation(async () => {
      mocks.session = {
        user: { id: "user-1", name: "Ada", email: "ada@example.test" },
        session: { id: "session-1" },
      };
      mocks.sessionError = true;
      mocks.loadAccount.mockResolvedValue({ status: "signed-in", account: mocks.session.user });
      return { data: {}, error: null };
    });
    const router = await page("/login?returnTo=%2Fsettings");
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    await screen.findByText(/You’re signed in, but the page could not load/);
    expect(router.state.location.pathname).toBe("/login");
    expect(screen.queryByLabelText("Password")).toBeNull();
    mocks.sessionError = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"));
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
  });

  it("restores a guest draft after failed then successful sign-in without sending", async () => {
    const deviceId = crypto.randomUUID(),
      projectId = crypto.randomUUID();
    mocks.devices.mockResolvedValue([
      {
        id: deviceId,
        name: "Remote computer",
        platform: "darwin",
        appVersion: "1.0.0",
        epoch: 1,
        revoked: false,
        online: true,
        lastSeenAt: null,
        projects: [{ id: projectId, name: "Remote project", providers: ["codex"], dirty: false }],
        capabilities: [
          {
            provider: "codex",
            available: true,
            reason: "ready",
            version: "test",
            definition: {
              version: 1,
              runtime: "process",
              modes: ["run"],
              approvals: true,
              modelSelection: false,
            },
            inputModes: [],
          },
        ],
      },
    ]);
    const router = await page("/tasks?from=guest");
    const prompt = "Guest draft 中😀";
    fireEvent.change(await screen.findByLabelText("What should the agent do?"), {
      target: { value: prompt },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in to send" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.searchStr).not.toContain(encodeURIComponent(prompt));
    mocks.signIn.mockResolvedValueOnce({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "incorrect" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The email or password is incorrect.",
    );
    mocks.signIn.mockImplementationOnce(async () => {
      mocks.session = {
        user: { id: "user-1", name: "Ada", email: "ada@example.test" },
        session: { id: "session-1" },
      };
      mocks.loadAccount.mockResolvedValue({ status: "signed-in", account: mocks.session.user });
      return { data: {}, error: null };
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    await waitFor(() => expect(router.state.location.pathname).toBe("/tasks"));
    fireEvent.click(await screen.findByRole("button", { name: "Remote project" }));
    await waitFor(() =>
      expect(screen.getByLabelText("What should the agent do?")).toHaveValue(prompt),
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(router.state.location.search).toMatchObject({ project: projectId, device: deviceId });
  });
});
