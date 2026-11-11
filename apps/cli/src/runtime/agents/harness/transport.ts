import { ProcessTransport } from "../transport.js";
import type { TransportFactory } from "@raypx/providers/core";

export type { AgentTransport, TransportFactory } from "@raypx/providers/core";
export const createTransport: TransportFactory = (...args) => new ProcessTransport(...args);
