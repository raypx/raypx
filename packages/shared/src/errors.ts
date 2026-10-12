export type DomainErrorCode = "BAD_REQUEST" | "MAIL_NOT_CONFIGURED";

export type DomainErrorValues = Record<string, string | number | boolean | null>;

/** Base class for errors raised by framework-independent business rules. */
export class DomainError<Code extends string = DomainErrorCode> extends Error {
  constructor(
    public readonly code: Code,
    message: string,
    public readonly values?: DomainErrorValues,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
