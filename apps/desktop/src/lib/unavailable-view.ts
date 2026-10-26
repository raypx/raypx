/** Browser acceptance has no Native transport and must never simulate local execution. */
export class Electroview {
  constructor() {
    throw new Error("DESKTOP_REQUIRED");
  }
  static defineRPC(): never {
    throw new Error("DESKTOP_REQUIRED");
  }
}
