import { z } from "zod";

export const runIdSchema = z.string().min(1).max(128).brand<"RunId">();
