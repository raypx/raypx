export type McpHeaders = Readonly<Record<string, string>>;
export interface McpRemoteTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
}
export interface McpCallResult {
  content: string;
  isError: boolean;
  truncated: boolean;
}
export interface McpConnection {
  url: string;
  headers: McpHeaders;
  /** Call-local only; never cataloged or persisted. */
  protectedValue?: string;
}
export interface McpTransport {
  validate(this: void, url: string): void;
  listTools(this: void, connection: McpConnection, signal: AbortSignal): Promise<McpRemoteTool[]>;
  callTool(
    this: void,
    connection: McpConnection,
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<McpCallResult>;
}
