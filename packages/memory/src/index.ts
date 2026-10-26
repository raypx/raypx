export * from "./model.js";

export class ContextError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ContextError";
  }
}
