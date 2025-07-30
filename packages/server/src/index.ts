import { type Database, db } from "@raypx/db"
import { Hono } from "hono"
import { compress } from "hono/compress"
import { contextStorage } from "hono/context-storage"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { prettyJSON } from "hono/pretty-json"
import { requestId } from "hono/request-id"

interface ServerOptions {
  prefix: string
}

type Variables = {
  db: Database
}

export const createApp = (options: ServerOptions) => {
  const app = new Hono<{ Variables: Variables }>().basePath(options.prefix)

  // Middlewares
  app
    .use(logger())
    .use(cors())
    .use(compress())
    .use(requestId())
    .use(contextStorage())
    .use(prettyJSON())

  // Database
  app.use("*", async (c, next) => {
    c.set("db", db)
    await next()
  })

  // Routes
  app.get("/", (c) => {
    return c.text("Hello World")
  })

  return app
}

export { handle as vercel } from "hono/vercel"
