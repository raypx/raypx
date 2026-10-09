import type { ComponentProps } from "react";

export function Button({ type = "button", ...props }: ComponentProps<"button">) {
  return <button type={type} {...props} />;
}

export interface ConnectionStatusProps {
  status: "loading" | "connected" | "error";
}

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  return (
    <output>
      {status === "loading" && "Connecting to backend…"}
      {status === "connected" && "Backend connected"}
      {status === "error" && "Cannot connect to backend, please confirm API service is running."}
    </output>
  );
}
