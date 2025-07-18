import { z } from "zod"

const AppSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  keywords: z.array(z.string()).min(1),
  url: z.string().min(1),
  githubUrl: z.string().min(1),
})

export const app = AppSchema.parse({
  name: "Raypx",
  description: "Raypx is a platform for building AI-powered applications.",
  keywords: ["Raypx", "AI", "Platform", "Framework"],
  url: "https://raypx.xyz",
  githubUrl: "https://github.com/raypx/raypx",
} satisfies z.infer<typeof AppSchema>)

export default app
