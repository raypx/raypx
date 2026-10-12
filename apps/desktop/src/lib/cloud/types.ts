export type SyncJobNameKey = "campaignExports" | "productResearch" | "designSystem";

export interface SyncJob {
  id: string;
  name: string;
  /** Present only for deterministic demo rows; remote names remain verbatim. */
  nameKey?: SyncJobNameKey;
  detail: { kind: "files" | "objects"; count: number; sizeBytes?: number };
  kind: "upload" | "download" | "index";
  status: "active" | "queued" | "complete";
  progress: number;
}

export interface CloudDevice {
  id: string;
  name: string;
  platform: string;
  kind: "desktop" | "laptop" | "phone";
  online: boolean;
  lastSeen: Date;
  syncedBytes: number;
}

export interface CloudSnapshot {
  lastChecked: Date;
  lastBackup: Date;
  pendingItems: number;
  fileCount: number;
  newThisWeek: number;
  storage: {
    used: number;
    total: number;
    projects: number;
    media: number;
    archives: number;
  };
  jobs: SyncJob[];
  devices: CloudDevice[];
}
