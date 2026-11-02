import { ProcessTransport } from "../transport";
import type { TransportFactory } from "@raypx/provider-core";

export type { AgentTransport, TransportFactory, AskApproval } from "@raypx/provider-core";
export const createTransport: TransportFactory = (...args) => new ProcessTransport(...args);
