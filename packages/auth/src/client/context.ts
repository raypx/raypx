import { createContext } from "react";
import type { AnyAuthClient } from "./auth";

export type AuthContextType = {
  auth: AnyAuthClient;
};

export const AuthContext = createContext<AuthContextType | null>(null);
