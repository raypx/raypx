export * from "./model.ts";

export class ContextError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ContextError";
  }
}
