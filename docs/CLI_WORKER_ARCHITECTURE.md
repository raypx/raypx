# CLI & Worker Architecture for Desktop Support

## Context

Building CLI tools and background workers that can support a desktop application while maintaining clear separation of concerns.

## Architecture Options

### Option 1: Monolithic CLI in Config Package (Current)

```
packages/
└── config/
    └── src/
        └── cli.ts    # raypx CLI
```

**Pros:** Simple
**Cons:** Limited, not desktop-aware

---

### Option 2: Dedicated CLI Package ⭐

```
apps/
├── web/              # Web application
├── desktop/          # Desktop app (Electron/Tauri)
└── cli/              # CLI application
    ├── src/
    │   ├── index.ts          # Main CLI entry
    │   ├── commands/         # Command handlers
    │   │   ├── dev.ts
    │   │   ├── build.ts
    │   │   ├── serve.ts
    │   │   └── worker.ts
    │   ├── api/             # Desktop IPC bridge
    │   │   ├── server.ts    # HTTP/WebSocket server
    │   │   └── ipc.ts       # Inter-process communication
    │   └── worker/          # Background tasks
    │       ├── build.ts     # Build watcher
    │       ├── sync.ts      # File sync
    │       └── db.ts        # Database tasks
    └── package.json

packages/
├── worker-shared/    # Shared worker logic
│   ├── src/
│   │   ├── tasks/
│   │   ├── queue.ts
│   │   └── ipc-protocol.ts
└── desktop-bridge/   # Desktop <-> CLI bridge
    ├── src/
    │   ├── client.ts    # Desktop side
    │   └── protocol.ts  # Shared protocol
```

**Communication Flow:**

```
┌─────────────┐         IPC/HTTP        ┌─────────────┐
│   Desktop   │ ◄──────────────────────► │   CLI App   │
│   (Tauri)   │                          │   (Node)    │
└─────────────┘                          └─────────────┘
                                                │
                                                │ Uses
                                                ▼
                                         ┌─────────────┐
                                         │   Workers   │
                                         │  (Threads)  │
                                         └─────────────┘
```

---

### Option 3: Unified Worker System ⭐⭐

```
packages/
├── worker/           # Generic worker system
│   ├── src/
│   │   ├── worker.ts        # Base worker
│   │   ├── manager.ts       # Worker pool
│   │   ├── tasks/           # Task definitions
│   │   │   ├── build.ts
│   │   │   ├── test.ts
│   │   │   ├── db-migrate.ts
│   │   │   └── file-sync.ts
│   │   └── ipc/            # Communication
│   │       ├── protocol.ts
│   │       └── bridge.ts
│   └── package.json
│
├── cli/              # CLI wrapper
│   ├── src/
│   │   ├── index.ts        # CLI entry
│   │   └── commands/       # Uses @raypx/worker
│   └── package.json
│
└── desktop-api/      # Desktop integration
    ├── src/
    │   ├── client.ts       # Desktop-side client
    │   ├── server.ts       # Worker API server
    │   └── protocol.ts     # Shared types
    └── package.json

apps/
├── web/              # Web app
├── cli/              # CLI app (uses packages/cli)
└── desktop/          # Desktop app (uses packages/desktop-api)
```

---

## Use Cases

### 1. CLI Tool

```bash
# Development commands
raypx dev              # Start dev server
raypx build            # Build for production
raypx test             # Run tests
raypx db:migrate       # Database migration

# Worker commands
raypx worker start     # Start worker daemon
raypx worker status    # Check worker status
raypx worker stop      # Stop worker
```

### 2. Desktop Integration

**Desktop app calls CLI workers:**

```typescript
// In desktop app (Tauri/Electron)
import { WorkerClient } from "@raypx/desktop-api";

const client = new WorkerClient();

// Start development server
await client.execute("dev", {
  port: 3000,
  watch: true,
});

// Watch build progress
client.on("build:progress", (progress) => {
  updateUI(progress);
});

// Run database migration
await client.execute("db:migrate", {
  env: "development",
});
```

### 3. Background Workers

**Long-running tasks:**

```typescript
// packages/worker/src/tasks/build.ts
import { defineTask } from "@raypx/worker";

export const buildTask = defineTask({
  name: "build",
  async execute(options) {
    // Build logic
    this.emit("progress", { percent: 50 });

    const result = await build(options);

    return result;
  },
});
```

---

## Implementation Details

### Worker Manager

```typescript
// packages/worker/src/manager.ts
import { Worker } from "node:worker_threads";

export class WorkerManager {
  private workers: Map<string, Worker> = new Map();

  async execute(taskName: string, options: any) {
    const worker = new Worker("./tasks/" + taskName + ".js");

    return new Promise((resolve, reject) => {
      worker.on("message", (result) => {
        if (result.type === "complete") {
          resolve(result.data);
        } else if (result.type === "progress") {
          this.emit("progress", result.data);
        }
      });

      worker.on("error", reject);
      worker.postMessage(options);
    });
  }

  async stopAll() {
    for (const [name, worker] of this.workers) {
      await worker.terminate();
    }
  }
}
```

### IPC Protocol

```typescript
// packages/worker/src/ipc/protocol.ts
export interface WorkerMessage {
  id: string;
  type: "execute" | "cancel" | "status";
  task: string;
  options?: any;
}

export interface WorkerResponse {
  id: string;
  type: "progress" | "complete" | "error";
  data: any;
}

export interface WorkerStatus {
  running: boolean;
  tasks: Array<{
    name: string;
    status: "pending" | "running" | "complete";
    progress?: number;
  }>;
}
```

### Desktop API Server

```typescript
// packages/desktop-api/src/server.ts
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { WorkerManager } from "@raypx/worker";

export class DesktopAPIServer {
  private wss: WebSocketServer;
  private manager: WorkerManager;

  constructor(port = 9000) {
    this.manager = new WorkerManager();

    const server = createServer();
    this.wss = new WebSocketServer({ server });

    this.wss.on("connection", (ws) => {
      ws.on("message", async (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === "execute") {
          const result = await this.manager.execute(message.task, message.options);

          ws.send(
            JSON.stringify({
              id: message.id,
              type: "complete",
              data: result,
            }),
          );
        }
      });
    });

    server.listen(port);
  }
}
```

### Desktop Client

```typescript
// packages/desktop-api/src/client.ts
export class WorkerClient extends EventEmitter {
  private ws: WebSocket;

  constructor(url = "ws://localhost:9000") {
    super();
    this.ws = new WebSocket(url);

    this.ws.on("message", (data) => {
      const response = JSON.parse(data.toString());

      if (response.type === "progress") {
        this.emit("progress", response.data);
      } else if (response.type === "complete") {
        this.emit("complete", response.data);
      }
    });
  }

  async execute(task: string, options?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();

      const handler = (response: any) => {
        if (response.id === id && response.type === "complete") {
          resolve(response.data);
          this.off("message", handler);
        }
      };

      this.on("message", handler);

      this.ws.send(
        JSON.stringify({
          id,
          type: "execute",
          task,
          options,
        }),
      );
    });
  }
}
```

---

## Desktop App Integration

### Tauri Example

```rust
// src-tauri/src/main.rs
use tauri::Manager;

#[tauri::command]
async fn execute_task(task: String, options: serde_json::Value) -> Result<String, String> {
    // Call worker API
    let client = reqwest::Client::new();
    let response = client
        .post("http://localhost:9000/execute")
        .json(&serde_json::json!({
            "task": task,
            "options": options,
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(response.text().await.unwrap())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![execute_task])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

```typescript
// Desktop app frontend
import { invoke } from "@tauri-apps/api/tauri";

async function runBuild() {
  const result = await invoke("execute_task", {
    task: "build",
    options: { production: true },
  });

  console.log("Build complete:", result);
}
```

---

## Example Tasks

### Build Watcher

```typescript
// packages/worker/src/tasks/build.ts
import { watch } from "node:fs";
import { defineTask } from "../worker";

export const buildWatchTask = defineTask({
  name: "build:watch",

  async execute(options: { cwd: string }) {
    const watcher = watch(options.cwd, { recursive: true });

    watcher.on("change", async (eventType, filename) => {
      this.emit("file-changed", { filename });

      this.emit("progress", { status: "building" });

      // Run build
      await runBuild();

      this.emit("progress", { status: "complete" });
    });

    // Keep running
    await new Promise(() => {});
  },
});
```

### Database Migration

```typescript
// packages/worker/src/tasks/db-migrate.ts
import { defineTask } from "../worker";
import { getDatabase } from "@raypx/db";
import { migrate } from "drizzle-orm/migrator";

export const migrateTask = defineTask({
  name: "db:migrate",

  async execute(options: { env: string }) {
    this.emit("progress", { status: "connecting" });

    const db = getDatabase();

    this.emit("progress", { status: "migrating", percent: 50 });

    await migrate(db, { migrationsFolder: "./migrations" });

    this.emit("progress", { status: "complete", percent: 100 });

    return { success: true };
  },
});
```

---

## Recommended Structure

```
raypx/
├── apps/
│   ├── web/              # Web application
│   ├── cli/              # CLI application
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── commands/
│   │   └── package.json
│   └── desktop/          # Desktop application (future)
│       ├── src/
│       ├── src-tauri/
│       └── package.json
│
└── packages/
    ├── worker/           # Worker system
    │   ├── src/
    │   │   ├── worker.ts
    │   │   ├── manager.ts
    │   │   ├── tasks/
    │   │   └── ipc/
    │   └── package.json
    │
    ├── cli-commands/     # CLI command implementations
    │   └── src/
    │       ├── dev.ts
    │       ├── build.ts
    │       └── serve.ts
    │
    ├── desktop-bridge/   # Desktop <-> Worker bridge
    │   ├── src/
    │   │   ├── client.ts
    │   │   ├── server.ts
    │   │   └── protocol.ts
    │   └── package.json
    │
    └── ... (existing packages)
```

---

## Benefits

1. **Separation of Concerns**
   - CLI logic separate from worker logic
   - Desktop can use workers without CLI
   - Each package has clear responsibility

2. **Reusability**
   - Workers can be used by CLI, desktop, or web
   - Tasks defined once, used everywhere
   - Protocol shared across platforms

3. **Scalability**
   - Add new tasks easily
   - Worker pool for parallelism
   - Desktop can control worker lifecycle

4. **Developer Experience**
   - Same commands in CLI and desktop
   - Progress feedback in real-time
   - Easy to debug

---

## Next Steps

1. **Decide on approach** (Option 2 or 3)
2. **Create package structure**
3. **Implement worker system**
4. **Build CLI wrapper**
5. **Add desktop bridge**
6. **Test integration**

Would you like me to implement one of these approaches?
