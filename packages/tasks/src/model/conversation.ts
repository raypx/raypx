import { applyActivityEvent } from "@raypx/core/activity";
import type { AgentEvent, TaskActivity } from "@raypx/core/tasks";
import type { TaskHistoryPage } from "./port.js";

export interface ConversationGap {
  id: number;
  before: number;
  after: number;
}
type History = Pick<TaskHistoryPage, "activity" | "activityBefore" | "events">;

/** Deterministic history projection; transport, timers and rendering live outside it. */
export class ConversationState {
  private cursor = 0;
  private readonly events = new Map<number, AgentEvent>();
  private readonly activity = new Map<string, TaskActivity>();
  private readonly orderedIds: string[] = [];
  private eventsVersion = 0;
  private snapshotEventsVersion = -1;
  private activityVersion = 0;
  private snapshotVersion = -1;
  private cachedActivity: TaskActivity[] = [];
  private cachedEvents: { cursor: number; event: AgentEvent }[] = [];
  private cachedGaps: ConversationGap[] = [];
  private cachedSnapshot: ReturnType<ConversationState["buildSnapshot"]> | undefined;
  private olderBefore: number | undefined;
  // A live entry can arrive ahead of a recovering HTTP page. Its order does not
  // prove that the intervening history was loaded (orders are global row IDs).
  private checkpointUpper = 0;
  private continuousLiveUpper = 0;
  private liveUpper = 0;
  private tracksLiveCoverage = false;
  private recovering = true;
  private initialized = false;
  private gaps: ConversationGap[] = [];

  get after() {
    return this.cursor;
  }
  get before() {
    return this.olderBefore;
  }
  gap(id: number) {
    const gap = this.gaps.find((item) => item.id === id);
    return gap ? { ...gap } : undefined;
  }
  /** Opt into reliable live coverage only when the caller reports every interruption. */
  beginRecovery() {
    this.tracksLiveCoverage = true;
    this.recovering = true;
  }
  private mergeActivity(entries: TaskActivity[]) {
    for (const entry of entries) {
      const previous = this.activity.get(entry.id);
      if (previous && entry.revision <= previous.revision) continue;
      if (!previous) {
        let low = 0,
          high = this.orderedIds.length;
        while (low < high) {
          const middle = (low + high) >>> 1;
          if (this.activity.get(this.orderedIds[middle]!)!.order <= entry.order) low = middle + 1;
          else high = middle;
        }
        this.orderedIds.splice(low, 0, entry.id);
      }
      this.activity.set(entry.id, entry);
      this.activityVersion++;
    }
  }
  private addGap(before: number, after: number) {
    const next = { id: before, before, after };
    const overlapping = this.gaps.filter((gap) => gap.after < before && gap.before > after);
    this.gaps = this.gaps.filter((gap) => !overlapping.includes(gap));
    for (const gap of overlapping) {
      next.before = Math.max(next.before, gap.before);
      next.after = Math.min(next.after, gap.after);
    }
    this.gaps.push(next);
  }
  mergeLatest(page: History) {
    const coveredUpper = Math.max(this.checkpointUpper, this.continuousLiveUpper);
    if (!this.initialized) {
      this.olderBefore = page.activityBefore;
      this.initialized = true;
    } else if (page.activity[0] && coveredUpper && (page.activityBefore ?? 0) > coveredUpper) {
      this.addGap(page.activityBefore!, coveredUpper);
    }
    let pageUpper = 0;
    for (const entry of page.activity) pageUpper = Math.max(pageUpper, entry.order);
    this.checkpointUpper = Math.max(this.checkpointUpper, pageUpper);
    if (this.tracksLiveCoverage && pageUpper >= this.liveUpper) this.recovering = false;
    if (page.activity.length) {
      const pageLower = page.activityBefore === undefined ? 0 : page.activity[0]!.order;
      this.gaps = this.gaps.filter((gap) => pageLower > gap.after || pageUpper < gap.before);
    }
    const recoveredUpper = Math.max(this.checkpointUpper, this.continuousLiveUpper);
    if (this.tracksLiveCoverage && this.recovering && this.liveUpper > recoveredUpper)
      this.addGap(this.liveUpper, recoveredUpper);
    this.mergeActivity(page.activity);
    for (const item of page.events) {
      if (this.events.get(item.cursor) !== item.event) {
        this.events.set(item.cursor, item.event);
        this.eventsVersion++;
      }
      this.cursor = Math.max(this.cursor, item.cursor);
    }
    return this.snapshot();
  }
  mergeOlder(page: History) {
    this.mergeActivity(page.activity);
    this.olderBefore = page.activityBefore;
  }
  mergeGap(id: number, page: History) {
    const boundary = this.gap(id);
    if (!boundary) return;
    this.mergeActivity(page.activity);
    this.gaps = this.gaps.flatMap((gap) =>
      gap.id !== id
        ? [gap]
        : page.activityBefore !== undefined && page.activityBefore > boundary.after
          ? [{ ...gap, before: page.activityBefore }]
          : [],
    );
  }
  /** Commit a batch only when every delta has its baseline; otherwise fetch a checkpoint. */
  applyEvents(events: AgentEvent[]) {
    const next = new Map<string, TaskActivity>();
    let liveUpper = this.liveUpper;
    for (const event of events) {
      if (event.kind !== "activity" && event.kind !== "activity_delta") return undefined;
      const id = event.kind === "activity" ? event.entry.id : event.entryId;
      const entry = applyActivityEvent(next.get(id) ?? this.activity.get(id), event);
      if (!entry) return undefined;
      next.set(id, entry);
      liveUpper = Math.max(liveUpper, entry.order);
    }
    this.mergeActivity([...next.values()]);
    this.liveUpper = liveUpper;
    if (this.tracksLiveCoverage && !this.recovering)
      this.continuousLiveUpper = Math.max(this.continuousLiveUpper, liveUpper);
    return this.snapshot().activity;
  }
  snapshot() {
    if (this.snapshotVersion !== this.activityVersion) {
      this.cachedActivity = this.orderedIds.map((id) => this.activity.get(id)!);
      this.snapshotVersion = this.activityVersion;
    }
    if (this.snapshotEventsVersion !== this.eventsVersion) {
      this.cachedEvents = [...this.events.entries()].map(([cursor, event]) => ({ cursor, event }));
      this.snapshotEventsVersion = this.eventsVersion;
    }
    if (
      this.cachedGaps.length !== this.gaps.length ||
      this.gaps.some((gap, index) => {
        const old = this.cachedGaps[index];
        return !old || old.id !== gap.id || old.before !== gap.before || old.after !== gap.after;
      })
    )
      this.cachedGaps = this.gaps.map((gap) => ({ ...gap }));
    const old = this.cachedSnapshot;
    if (
      !old ||
      old.activity !== this.cachedActivity ||
      old.events !== this.cachedEvents ||
      old.activityGaps !== this.cachedGaps ||
      old.activityBefore !== this.olderBefore
    )
      this.cachedSnapshot = this.buildSnapshot();
    return this.cachedSnapshot!;
  }
  private buildSnapshot() {
    return {
      activityBefore: this.olderBefore,
      activityGaps: this.cachedGaps,
      activity: this.cachedActivity,
      events: this.cachedEvents,
    };
  }
}
