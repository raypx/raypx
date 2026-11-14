/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as matchers from "@testing-library/jest-dom/matchers";
// oxlint-disable-next-line import/no-empty-named-blocks, unicorn/require-module-specifiers
import type {} from "@testing-library/jest-dom/vitest";
import { routineSchema, type Routine, type RoutineHistory } from "@raypx/core/routines";
import type { RoutinesPort } from "../model.js";
import { BrowserLanguageProvider } from "../../tests/i18n.js";
import { RoutinesPanel } from "./routines.js";

expect.extend(matchers);
afterEach(cleanup);
const spaceId = "11111111-1111-4111-8111-111111111111";
const agentId = "22222222-2222-4222-8222-222222222222";
const routineId = "33333333-3333-4333-8333-333333333333";
function routine(): Routine {
  return routineSchema.parse({
    id: routineId,
    spaceId,
    agentId,
    ownerAccountId: "member",
    name: "Daily check",
    prompt: "Review the queue",
    enabled: true,
    triggers: { schedule: { cron: "0 9 * * 1-5", timezone: "UTC" } },
    emailAddress: null,
    nextDueAt: "2026-11-16T09:00:00Z",
    createdAt: "2026-11-14T00:00:00Z",
    updatedAt: "2026-11-14T00:00:00Z",
  });
}
function setup(initial: Routine[] = [], language: "en" | "zh" = "en") {
  let items = initial;
  const port: RoutinesPort = {
    list: vi.fn(async () => items),
    get: vi.fn(async () => items[0]!),
    create: vi.fn(async ({ routine: input }) => {
      const created = { ...routine(), ...input };
      items = [created];
      return {
        routine: created,
        webhookKey: input.triggers.webhook ? "created-once-key" : null,
        repositorySecret: input.triggers.repository ? "repository-once-secret" : null,
      };
    }),
    update: vi.fn(async ({ routine: input }) => ({
      routine: { ...routine(), ...input },
      webhookKey: null,
      repositorySecret: null,
    })),
    pause: vi.fn(async () => ({ ...routine(), enabled: false })),
    resume: vi.fn(async () => routine()),
    delete: vi.fn(async () => ({ deleted: true as const })),
    test: vi.fn(async () => ({
      status: "fired" as const,
      runId: "result-run",
      conversationId: "conversation",
    })),
    rotateWebhookKey: vi.fn(async () => ({ routine: items[0]!, webhookKey: "rotated-once-key" })),
    history: vi.fn(async () => []),
    events: vi.fn(async () => []),
  };
  const openRun = vi.fn();
  render(
    <BrowserLanguageProvider initialPreference={language} restorePreference={false}>
      <RoutinesPanel
        spaceId={spaceId}
        agentId={agentId}
        accountId="member"
        port={port}
        onOpenRun={openRun}
      />
    </BrowserLanguageProvider>,
  );
  return { port, openRun };
}

it("creates a Cron routine and runs it in the conversation", async () => {
  const user = userEvent.setup();
  const { port, openRun } = setup();
  await screen.findByText("No routines for this Agent yet.");
  await user.click(screen.getByRole("button", { name: "New routine" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
    target: { value: "Morning review" },
  });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Prompt" }), {
    target: { value: "Review the queue" },
  });
  expect(within(dialog).getByRole("textbox", { name: "Cron expression" })).toHaveValue(
    "0 9 * * 1-5",
  );
  expect(within(dialog).getByText("Runs next at these times:")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Create routine" }));
  await within(dialog).findByText("Routine saved.");
  expect(port.create).toHaveBeenCalledWith(
    expect.objectContaining({
      spaceId,
      routine: expect.objectContaining({
        name: "Morning review",
        triggers: expect.objectContaining({ schedule: expect.any(Object) }),
      }),
    }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), {
    timeout: 5000,
  });
  await waitFor(() => expect(screen.getByRole("button", { name: "New routine" })).toHaveFocus(), {
    timeout: 5000,
  });
  const article = await screen.findByRole("article", { name: "Morning review" });
  await user.click(within(article).getByRole("button", { name: "Run now" }));
  await waitFor(() => expect(openRun).toHaveBeenCalledWith("result-run"));
});

it("shows only selected trigger fields and forgets one-time secrets when closed", async () => {
  const user = userEvent.setup();
  setup();
  await screen.findByText("No routines for this Agent yet.");
  await user.click(screen.getByRole("button", { name: "New routine" }));
  let dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
    target: { value: "Inbound review" },
  });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Prompt" }), {
    target: { value: "Review incoming updates" },
  });
  await user.click(within(dialog).getByRole("checkbox", { name: "Cron" }));
  expect(
    within(dialog).queryByRole("textbox", { name: "Cron expression" }),
  ).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("textbox", { name: "Allowed sender" })).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("checkbox", { name: "Webhook" }));
  await user.click(within(dialog).getByRole("checkbox", { name: "Repository events" }));
  expect(within(dialog).getByRole("textbox", { name: "Event kinds" })).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Create routine" }));
  await within(dialog).findByText("created-once-key");
  expect(within(dialog).getByText("repository-once-secret")).toBeInTheDocument();
  expect(
    within(dialog).getByText(
      "Copy these secrets now. They will not be shown again after this dialog closes.",
    ),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), {
    timeout: 5000,
  });
  const article = await screen.findByRole("article", { name: "Inbound review" });
  await user.click(within(article).getByRole("button", { name: "Edit" }));
  dialog = await screen.findByRole("dialog");
  expect(within(dialog).queryByText("created-once-key")).not.toBeInTheDocument();
  expect(within(dialog).queryByText("repository-once-secret")).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Rotate webhook key" }));
  await within(dialog).findByText("rotated-once-key");
  await user.click(within(dialog).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByText("rotated-once-key")).not.toBeInTheDocument(), {
    timeout: 5000,
  });
});

it("warns about ownership and opens actual history including lateness", async () => {
  const user = userEvent.setup();
  const { port, openRun } = setup([{ ...routine(), ownerAccountId: "another-member" }]);
  const occurrence: RoutineHistory = {
    id: "occurrence",
    routineId,
    kind: "schedule",
    dueAt: "2026-11-14T00:00:00Z",
    createdAt: "2026-11-14T00:00:00Z",
    runId: "late-run",
    conversationId: "conversation",
    status: "fired",
    startedAt: "2026-11-14T00:40:00Z",
    delayMs: 2_400_000,
    runState: "succeeded",
  };
  vi.mocked(port.history).mockResolvedValue([occurrence]);
  const article = await screen.findByRole("article", { name: "Daily check" });
  await within(article).findByText("Last outcome: Completed");
  await user.click(within(article).getByRole("button", { name: "Edit" }));
  let dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByText(
      "Saving makes you this routine’s owner. Future Runs will use your credentials and approval rules.",
    ),
  ).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), {
    timeout: 5000,
  });
  await user.click(within(article).getByRole("button", { name: "History" }));
  dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("Started 40 min late");
  expect(within(dialog).getByText("Started")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Open Run" }));
  expect(openRun).toHaveBeenCalledWith("late-run");
});

it("requires confirmation before deletion and announces failures without dropping edits", async () => {
  const user = userEvent.setup();
  const { port } = setup([routine()]);
  const article = await screen.findByRole("article", { name: "Daily check" });
  await user.click(within(article).getByRole("button", { name: "Delete" }));
  const confirmation = await screen.findByRole("alertdialog");
  expect(port.delete).not.toHaveBeenCalled();
  await user.click(within(confirmation).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(), {
    timeout: 5000,
  });
  await user.click(within(article).getByRole("button", { name: "Edit" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Prompt" }), {
    target: { value: "Keep my edited prompt" },
  });
  vi.mocked(port.update).mockRejectedValue({ code: "BAD_REQUEST", message: "PAYLOAD_TOO_LARGE" });
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await within(dialog).findByText("The incoming content is too large.");
  expect(within(dialog).getByRole("textbox", { name: "Prompt" })).toHaveValue(
    "Keep my edited prompt",
  );
});

it("shows authoritative ingress URLs and email rather than renderer-derived addresses", async () => {
  const user = userEvent.setup();
  const configured = {
    ...routine(),
    triggers: {
      webhook: true,
      repository: { events: ["push"] },
      email: { allowedSender: "member@example.test" },
    },
    emailAddress: "old-unused@example.test",
    ingress: {
      webhook: { url: "https://ingress.example.test/custom/webhook", unavailableReason: null },
      repository: {
        url: "https://ingress.example.test/custom/repository",
        unavailableReason: null,
      },
      email: { address: "server-provided@example.test", unavailableReason: null },
    },
  };
  setup([configured]);
  const article = await screen.findByRole("article", { name: configured.name });
  await user.click(within(article).getByRole("button", { name: "Edit" }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("https://ingress.example.test/custom/webhook");
  expect(
    within(dialog).getByText("https://ingress.example.test/custom/repository"),
  ).toBeInTheDocument();
  expect(within(dialog).getByText("server-provided@example.test")).toBeInTheDocument();
  expect(within(dialog).queryByText("old-unused@example.test")).not.toBeInTheDocument();
});

it.each([
  [
    "en",
    "Edit",
    "This deployment has no public address configured.",
    "Inbound email is not configured on this deployment.",
  ],
  ["zh", "编辑", "此部署未配置公共地址。", "此部署未配置收件邮箱。"],
] as const)(
  "displays deployment ingress reasons in %s",
  async (language, edit, publicReason, emailReason) => {
    const user = userEvent.setup();
    const configured: Routine = {
      ...routine(),
      triggers: {
        webhook: true,
        repository: { events: ["push"] },
        email: { allowedSender: "member@example.test" },
      },
      ingress: {
        webhook: { url: null, unavailableReason: "PUBLIC_API_ORIGIN_NOT_CONFIGURED" },
        repository: { url: null, unavailableReason: "PUBLIC_API_ORIGIN_NOT_CONFIGURED" },
        email: { address: null, unavailableReason: "EMAIL_NOT_CONFIGURED" },
      },
    };
    setup([configured], language);
    const article = await screen.findByRole("article", { name: configured.name });
    await user.click(within(article).getByRole("button", { name: edit }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findAllByText(publicReason)).toHaveLength(2);
    expect(within(dialog).getByText(emailReason)).toBeInTheDocument();
    expect(within(dialog).queryByText(/https:\/\/api\.example\.test/)).not.toBeInTheDocument();
  },
);
