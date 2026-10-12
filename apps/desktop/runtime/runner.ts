import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { createPiProvider, type AiProvider } from "@voidmix/ai";
import type { RunCommandDto } from "@voidmix/contracts";
import { authorizeBinding, enforceProjectPath } from "./authorization.js";
import { RunnerJournal } from "./journal.js";
import type {
  EventInput,
  LocalRun,
  ProviderFactory,
  RunnerBinding,
  RunnerCloud,
  RunnerNotice,
  RunnerStatus,
} from "./types.js";

interface ActiveRun {
  provider: AiProvider;
  sessionId: string;
  controller: AbortController;
  completion: Promise<void>;
}
export class LocalRunner {
  private readonly active = new Map<string, ActiveRun>();
  private readonly approvals = new Map<string, (decision: "approve" | "deny") => void>();
  private readonly listeners = new Set<(event: RunnerNotice) => void>();
  private cloud: RunnerCloud | null = null;
  private busy = false;
  private stopping = false;
  private reason: string | null = "Device is not connected to the cloud.";
  constructor(
    private readonly journal: RunnerJournal,
    private readonly dataDirectory: string,
    private readonly providerFactory?: ProviderFactory,
  ) {
    if (!journal.setting("registrationId"))
      journal.setSetting("registrationId", crypto.randomUUID());
    journal.recoverInterrupted();
  }
  connect(cloud: RunnerCloud, deviceId: string): void {
    this.cloud = cloud;
    this.journal.setSetting("deviceId", deviceId);
    this.reason = null;
    this.notify();
  }
  status(): RunnerStatus {
    return {
      registrationId: this.journal.setting<string>("registrationId")!,
      availability: this.cloud ? "ready" : "unavailable",
      reason: this.reason,
      deviceId: this.journal.setting<string>("deviceId"),
      bindings: this.journal.bindings(),
      runs: this.journal.runs().map((run) => ({
        id: run.claim.run.id,
        projectId: run.claim.run.projectId,
        status: run.status,
        error: run.error,
        pendingApproval: run.pendingApproval,
        events: this.journal.events(run.claim.run.id, 0, 500),
        files: this.journal
          .artifacts(run.claim.run.id)
          .map(({ bodyBase64: _body, ...file }) => file),
      })),
    };
  }
  subscribe(listener: (event: RunnerNotice) => void): () => void {
    this.listeners.add(listener);
    listener({ type: "status", status: this.status() });
    return () => this.listeners.delete(listener);
  }
  private notify(): void {
    const status = this.status();
    for (const listener of this.listeners) listener({ type: "status", status });
  }
  private emit(runId: string, event: EventInput): void {
    this.journal.append(runId, event);
    this.notify();
  }
  async grant(input: Omit<RunnerBinding, "localBindingId">): Promise<RunnerBinding> {
    const binding = await authorizeBinding(input);
    this.journal.saveBinding(binding);
    this.notify();
    return binding;
  }
  async revoke(id: string): Promise<void> {
    this.journal.revokeBinding(id);
    for (const run of this.journal.runs())
      if (run.claim.binding.localBindingId === id) await this.cancel(run.claim.run.id);
    this.notify();
  }
  async tick(): Promise<void> {
    if (!this.cloud || this.busy || this.stopping) return;
    this.busy = true;
    try {
      await this.cloud.heartbeat();
      this.reason = null;
      // Reconcile durable claims first; a crash between cloud ACK and local commit must retry ACK.
      for (const run of this.journal.runs()) {
        if (!run.acknowledged) await this.accept(run);
        await this.synchronize(run.claim.run.id);
        await this.applyCommands(run.claim.run.id);
      }
      const claim = await this.cloud.claim();
      if (claim) await this.accept(this.journal.claim(claim));
    } catch {
      this.reason = "Cloud connection unavailable; accepted local work continues.";
    } finally {
      this.busy = false;
      this.notify();
    }
  }
  private async accept(run: LocalRun): Promise<void> {
    if (run.acknowledged || this.stopping) return;
    // No tools run before cloud authority has durably acknowledged this device's claim.
    await this.cloud!.acknowledge({ runId: run.claim.run.id, claimId: run.claim.claimId });
    run.acknowledged = true;
    this.journal.saveRun(run);
    const binding = this.journal.binding(run.claim.binding.localBindingId);
    if (
      !binding ||
      binding.projectId !== run.claim.run.projectId ||
      run.claim.binding.tools.some((tool) => !binding.tools.includes(tool)) ||
      run.claim.binding.model?.id !== binding.model.id ||
      run.claim.binding.model.provider !== binding.model.provider
    ) {
      this.emit(run.claim.run.id, {
        type: "run.status",
        payload: { status: "failed", error: "Authorized local binding or model is unavailable." },
      });
      return;
    }
    const completion = this.execute(run, binding);
    // execute installs its active record before the first provider prompt.
    void completion.catch(() => {});
  }
  private async execute(run: LocalRun, binding: RunnerBinding): Promise<void> {
    const id = run.claim.run.id;
    const controller = new AbortController();
    const guardTool = async (input: {
      name: string;
      arguments: unknown;
      callId: string;
      signal: AbortSignal | undefined;
    }) => {
      const current = this.journal.binding(binding.localBindingId);
      if (!current || !run.claim.binding.tools.includes(input.name))
        throw new Error("Tool grant has been revoked.");
      const args =
        typeof input.arguments === "object" && input.arguments !== null
          ? (input.arguments as Record<string, unknown>)
          : {};
      if (input.name !== "bash") {
        args.path = await enforceProjectPath(
          binding.path,
          typeof args.path === "string" ? args.path : ".",
        );
      }
      if (["write", "edit", "bash"].includes(input.name)) {
        const prompt =
          input.name === "bash"
            ? `Run shell command (may access resources beyond this project): ${String(args.command ?? "")}`
            : `${input.name} ${String(args.path)}`;
        await this.waitForApproval(id, input.callId, prompt, input.signal);
        if (!this.journal.binding(binding.localBindingId))
          throw new Error("Tool grant has been revoked.");
        if (input.name !== "bash")
          args.path = await enforceProjectPath(binding.path, String(args.path));
      }
    };
    const provider = this.providerFactory
      ? this.providerFactory({ binding, guardTool })
      : createPiProvider({
          cwd: binding.path,
          agentDir: join(this.dataDirectory, "pi"),
          sessionDirectory: join(this.dataDirectory, "sessions"),
          requireModel: true,
          guardTool,
        });
    let sessionId: string | null = null;
    let finish!: () => void;
    const completion = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const active: ActiveRun = { provider, sessionId: "", controller, completion };
    this.active.set(id, active);
    let messageIndex = 1;
    const written = new Map<string, string>();
    try {
      await mkdir(join(this.dataDirectory, "sessions"), { recursive: true, mode: 0o700 });
      if (controller.signal.aborted || this.stopping) throw new Error("Runner is stopping.");
      const session = await provider.createSession({
        projectId: binding.projectId,
        cwd: binding.path,
        model: binding.model,
        tools: run.claim.binding.tools,
        ...(run.sessionFile ? { sessionFile: run.sessionFile } : {}),
      });
      sessionId = session.id;
      const current = this.journal.run(id)!;
      current.sessionFile = session.sessionFile ?? null;
      this.journal.saveRun(current);
      active.sessionId = session.id;
      this.emit(id, { type: "run.status", payload: { status: "running" } });
      try {
        for await (const event of provider.run({
          session,
          project: { id: binding.projectId, title: "Authorized project" },
          prompt: run.claim.run.prompt,
          signal: controller.signal,
        })) {
          const messageId = `${id}:message:${messageIndex}`;
          if (event.type === "text_delta")
            this.emit(id, { type: "message.delta", payload: { messageId, text: event.text } });
          if (event.type === "message_completed") {
            this.emit(id, { type: "message.completed", payload: { messageId, text: event.text } });
            messageIndex++;
          }
          if (event.type === "tool_call") {
            this.emit(id, {
              type: "tool.started",
              payload: { callId: event.callId, name: event.name, input: event.input },
            });
            const args = event.input as Record<string, unknown> | null;
            if (["write", "edit"].includes(event.name) && typeof args?.path === "string")
              written.set(event.callId, args.path);
          }
          if (event.type === "tool_result") {
            this.emit(id, {
              type: "tool.completed",
              payload: { callId: event.callId, name: event.name, output: event.output },
            });
            const path = written.get(event.callId);
            if (path) await this.captureArtifact(id, binding.path, path);
          }
          if (event.type === "completed")
            this.emit(id, {
              type: "run.status",
              payload: { status: "succeeded", output: { text: event.text } },
            });
          if (event.type === "failed")
            this.emit(id, {
              type: "run.status",
              payload: {
                status: "failed",
                error: "Pi execution failed; check provider configuration and local session.",
              },
            });
          if (event.type === "cancelled")
            this.emit(id, { type: "run.status", payload: { status: "cancelled" } });
        }
      } finally {
        /* provider disposal below remains part of shutdown */
      }
      if (["running", "waiting_for_approval"].includes(this.journal.run(id)!.status))
        this.emit(id, {
          type: "run.status",
          payload: {
            status: "failed",
            error: "Runner ended without an authoritative terminal result.",
          },
        });
    } catch {
      this.emit(id, {
        type: "run.status",
        payload: {
          status: controller.signal.aborted ? "cancelled" : "failed",
          error: controller.signal.aborted
            ? null
            : "Pi runtime, credentials, model, or authorized project is unavailable.",
        },
      });
    } finally {
      if (sessionId) await provider.disposeSession?.(sessionId);
      this.active.delete(id);
      this.notify();
      finish();
    }
  }
  private async captureArtifact(runId: string, root: string, path: string): Promise<void> {
    const canonical = await enforceProjectPath(root, path);
    const info = await stat(canonical);
    if (!info.isFile() || info.size > 10 * 1024 * 1024) return;
    const body = await readFile(canonical);
    const checksum = createHash("sha256").update(body).digest("hex");
    const id = createHash("sha256").update(`${runId}:${canonical}:${checksum}`).digest("hex");
    this.journal.saveArtifact({
      id,
      runId,
      path: canonical,
      name: basename(path),
      size: body.length,
      checksum,
      syncStatus: "pending",
      assetVersionId: null,
      bodyBase64: body.toString("base64"),
    });
    this.notify();
  }
  private async waitForApproval(
    runId: string,
    approvalId: string,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) throw new Error("Tool cancelled.");
    const run = this.journal.run(runId)!;
    run.pendingApproval = { approvalId, prompt };
    this.journal.saveRun(run);
    this.emit(runId, { type: "run.status", payload: { status: "waiting_for_approval" } });
    this.emit(runId, { type: "approval.requested", payload: { approvalId, prompt } });
    const decision = await new Promise<"approve" | "deny">((resolve) => {
      this.approvals.set(`${runId}:${approvalId}`, resolve);
      signal?.addEventListener("abort", () => resolve("deny"), { once: true });
    });
    this.approvals.delete(`${runId}:${approvalId}`);
    this.emit(runId, { type: "approval.resolved", payload: { approvalId, decision } });
    this.emit(runId, { type: "run.status", payload: { status: "running" } });
    if (decision !== "approve") throw new Error("Tool execution was not approved.");
  }
  approve(runId: string, approvalId: string, decision: "approve" | "deny"): void {
    const resolve = this.approvals.get(`${runId}:${approvalId}`);
    if (!resolve) throw new Error("Approval is no longer pending.");
    resolve(decision);
  }
  async cancel(runId: string): Promise<void> {
    const active = this.active.get(runId);
    if (active) {
      active.controller.abort();
      await active.provider.cancel(active.sessionId);
    }
  }
  async steer(runId: string, prompt: string): Promise<void> {
    const active = this.active.get(runId);
    if (!active?.provider.steer || !prompt.trim())
      throw new Error("Run is not available for steering.");
    await active.provider.steer(active.sessionId, prompt);
  }
  private async synchronize(runId: string): Promise<void> {
    const run = this.journal.run(runId)!;
    const events = this.journal.events(runId, run.syncedSeq);
    if (events.length) {
      const result = await this.cloud!.append({ runId, claimId: run.claim.claimId, events });
      const last = events[events.length - 1]!.seq;
      if (result.acknowledgedSeq < run.syncedSeq || result.acknowledgedSeq > last)
        throw new Error("Cloud event acknowledgement is invalid.");
      const current = this.journal.run(runId)!;
      current.syncedSeq = result.acknowledgedSeq;
      this.journal.saveRun(current);
    }
    if (this.cloud!.uploadArtifact)
      for (const artifact of this.journal.artifacts(runId)) {
        if (artifact.syncStatus !== "pending") continue;
        const uploaded = await this.cloud!.uploadArtifact({
          runId,
          claimId: run.claim.claimId,
          name: artifact.name,
          bodyBase64: artifact.bodyBase64,
          checksum: artifact.checksum,
          contentType: "application/octet-stream",
          idempotencyKey: artifact.id,
        });
        artifact.assetVersionId = uploaded.assetVersionId;
        artifact.syncStatus = "synced";
        this.journal.saveArtifact(artifact);
        this.emit(runId, {
          type: "artifact.created",
          payload: {
            assetVersionId: uploaded.assetVersionId,
            name: artifact.name,
            mediaType: "application/octet-stream",
          },
        });
      }
  }
  private async applyCommands(runId: string): Promise<void> {
    const run = this.journal.run(runId)!;
    const key = { runId, claimId: run.claim.claimId };
    for (const command of (await this.cloud!.commands(key)).items) {
      let result = this.journal.command(command.id);
      if (!result) {
        try {
          await this.applyCommand(command);
          result = { outcome: "applied" };
        } catch {
          result = { outcome: "rejected", error: "Local run cannot apply this command." };
        }
        this.journal.recordCommand(command.id, result);
      }
      await this.cloud!.acknowledgeCommand({ ...key, commandId: command.id, ...result });
    }
  }
  private async applyCommand(command: RunCommandDto): Promise<void> {
    if (command.type === "cancel") await this.cancel(command.runId);
    if (command.type === "steer")
      await this.steer(command.runId, String(command.payload.prompt ?? ""));
    if (command.type === "approval") {
      const decision = command.payload.decision;
      if (decision !== "approve" && decision !== "deny")
        throw new Error("Invalid approval decision.");
      this.approve(command.runId, String(command.payload.approvalId ?? ""), decision);
    }
  }
  async stop(): Promise<void> {
    this.stopping = true;
    while (this.busy) await new Promise<void>((resolve) => setTimeout(resolve, 10));
    for (const active of this.active.values()) active.controller.abort();
    await Promise.all([...this.active.values()].map((active) => active.completion));
  }
}
