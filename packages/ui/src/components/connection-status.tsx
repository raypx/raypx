export interface ConnectionStatusProps {
  status: "loading" | "connected" | "error";
}

/** Render connection state supplied by the application without initiating requests. */
export function ConnectionStatus({ status }: ConnectionStatusProps) {
  return (
    <output aria-live="polite" className="block text-sm text-muted-foreground">
      {status === "loading" && "Connecting to backend…"}
      {status === "connected" && "Backend connected"}
      {status === "error" && "Cannot connect to backend, please confirm API service is running."}
    </output>
  );
}
