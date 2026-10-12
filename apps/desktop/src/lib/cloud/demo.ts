import type { CloudSnapshot } from "./types";

const gibibyte = 1024 ** 3;
const minute = 60 * 1000;
const hour = 60 * minute;
const demoNow = new Date();

export const demoCloudSnapshot: CloudSnapshot = {
  lastChecked: demoNow,
  lastBackup: new Date(demoNow.valueOf() - 8 * minute),
  pendingItems: 2,
  fileCount: 12_846,
  newThisWeek: 184,
  storage: {
    used: 81.4 * gibibyte,
    total: 200 * gibibyte,
    projects: 42.8 * gibibyte,
    media: 27.3 * gibibyte,
    archives: 11.3 * gibibyte,
  },
  jobs: [
    {
      id: "job_1",
      name: "Campaign exports",
      nameKey: "campaignExports",
      detail: { kind: "files", count: 18, sizeBytes: 1.8 * gibibyte },
      kind: "upload",
      status: "active",
      progress: 72,
    },
    {
      id: "job_2",
      name: "Product research",
      nameKey: "productResearch",
      detail: { kind: "files", count: 4, sizeBytes: 680 * 1024 ** 2 },
      kind: "download",
      status: "active",
      progress: 38,
    },
    {
      id: "job_3",
      name: "Design system",
      nameKey: "designSystem",
      detail: { kind: "objects", count: 328 },
      kind: "index",
      status: "complete",
      progress: 100,
    },
  ],
  devices: [
    {
      id: "dev_1",
      name: "Mac Studio",
      platform: "macOS 16.0",
      kind: "desktop",
      online: true,
      lastSeen: demoNow,
      syncedBytes: 48.2 * gibibyte,
    },
    {
      id: "dev_2",
      name: "Surface Laptop",
      platform: "Windows 12",
      kind: "laptop",
      online: true,
      lastSeen: demoNow,
      syncedBytes: 31.7 * gibibyte,
    },
    {
      id: "dev_3",
      name: "Alex's iPhone",
      platform: "iOS 20",
      kind: "phone",
      online: false,
      lastSeen: new Date(demoNow.valueOf() - 2 * hour),
      syncedBytes: 1.5 * gibibyte,
    },
  ],
};
