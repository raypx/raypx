import { Analytics } from "@vercel/analytics/react";
import type { FC, ReactNode } from "react";

export const AnalyticsProvider: FC<{ children: ReactNode }> = ({ children }) => (
  <>
    {children}
    {import.meta.env.NODE_ENV === "production" && <Analytics />}
  </>
);
