import { Analytics } from "@vercel/analytics/react";
import type { FC, ReactNode } from "react";
import { envs } from "./envs";

export const AnalyticsProvider: FC<{ children: ReactNode }> = ({ children }) => (
  <>
    {children}
    {envs.NODE_ENV === "production" && <Analytics />}
  </>
);
