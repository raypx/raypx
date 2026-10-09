# @raypx/worker

Unified worker system for background task execution.

## Features

- ✅ **Task Definition** - Define reusable tasks with TypeScript
- ✅ **Task Management** - Run, cancel, monitor multiple tasks
- ✅ **Progress Tracking** - Real-time progress updates
- ✅ **Event System** - Listen to task lifecycle events
- ✅ **IPC Protocol** - Standard protocol for desktop integration
- ✅ **Type-safe** - Full TypeScript support

## Quick Start

### Define a Task

```typescript
import { defineTask } from "@raypx/worker";

export const buildTask = defineTask({
  name: "build",
  description: "Build the application",

  async execute(options: { production: boolean }) {
    // Emit progress
    this.emit("progress", { status: "compiling", percent: 0 });

    // Do work...
    await compile();

    this.emit("progress", { status: "bundling", percent: 50 });
    await bundle();

    this.emit("progress", { status: "complete", percent: 100 });

    return { success: true, outputPath: "./dist" };
  },
});
```

### Execute Tasks

```typescript
import { getWorkerManager } from "@raypx/worker";
import { buildTask } from "./tasks/build";

const manager = getWorkerManager();

// Register tasks
manager.register(buildTask);

// Execute
const result = await manager.execute("build", { production: true });

console.log("Build result:", result);
```

### Listen to Events

```typescript
manager.on("task:start", (task) => {
  console.log("Task started:", task.name);
});

manager.on("task:progress", (data) => {
  console.log("Progress:", data.progress);
});

manager.on("task:complete", (data) => {
  console.log("Task complete:", data.result);
});

manager.on("task:error", (data) => {
  console.error("Task failed:", data.error);
});
```

## Built-in Tasks

Task options and results default to `unknown`; specify types in task definitions.
Progress updates use an object with optional `status` and `percent` fields.
The manager creates a separate execution for every invocation, so concurrent
calls of one registered task have independent events and cancellation state.
Cancellation is cooperative: task code should check `this.isCancelled()`.
A cancelled execution rejects with `TaskCancelledError` when it settles, never
reports completion, and runs cleanup once. Cleanup also runs after success or
failure. The dynamic task-name interface does not validate options; callers
must validate external inputs before invoking a registered task.

### Build Task

```typescript
import { buildTask } from "@raypx/worker/tasks";

await manager.execute("build", {
  production: true,
  watch: false,
});
```

### Test Task

```typescript
import { testTask } from "@raypx/worker/tasks";

await manager.execute("test", {
  watch: false,
  coverage: true,
});
```

### Database Migration

```typescript
import { migrateTask } from "@raypx/worker/tasks";

await manager.execute("db:migrate", {
  env: "development",
});
```

## Desktop Integration

### Server Side (CLI/Node)

```typescript
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { getWorkerManager } from "@raypx/worker";
import type { WorkerMessage } from "@raypx/worker";

const manager = getWorkerManager();
const server = createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("message", async (data) => {
    const message: WorkerMessage = JSON.parse(data.toString());

    if (message.type === "execute") {
      const result = await manager.execute(message.task, message.options);

      ws.send(
        JSON.stringify({
          id: message.id,
          type: "complete",
          taskId: message.task,
          result,
        }),
      );
    }
  });

  // Forward events to client
  manager.on("task:progress", (data) => {
    ws.send(
      JSON.stringify({
        type: "progress",
        ...data,
      }),
    );
  });
});

server.listen(9000);
```

### Client Side (Desktop/Tauri)

```typescript
class WorkerClient {
  private ws: WebSocket;

  constructor(url = "ws://localhost:9000") {
    this.ws = new WebSocket(url);
  }

  async execute(task: string, options?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();

      const handler = (event: MessageEvent) => {
        const response = JSON.parse(event.data);

        if (response.id === id && response.type === "complete") {
          resolve(response.result);
          this.ws.removeEventListener("message", handler);
        }
      };

      this.ws.addEventListener("message", handler);

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

// Usage
const client = new WorkerClient();
const result = await client.execute("build", { production: true });
```

## API Reference

### `defineTask(definition)`

Define a new task.

**Parameters:**

- `definition.name` - Unique task name
- `definition.description` - Task description
- `definition.execute` - Async function to execute
- `definition.cleanup` - Optional cleanup function

**Returns:** Task instance

### `WorkerManager`

Manages task execution and lifecycle.

**Methods:**

- `register(task)` - Register a task
- `execute(name, options)` - Execute a task
- `cancel(id)` - Cancel a running task
- `getStatus()` - Get all running tasks
- `getAvailableTasks()` - List available tasks
- `cancelAll()` - Cancel all tasks

**Events:**

- `task:start` - Task started
- `task:progress` - Progress update
- `task:complete` - Task completed
- `task:error` - Task failed
- `task:cancel` - Task cancelled

### `getWorkerManager()`

Get the global worker manager instance.

---

**Unified task execution for CLI and desktop** ⚙️
