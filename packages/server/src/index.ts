import { auth } from "@raypx/auth"
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
  session?: Awaited<ReturnType<typeof auth.api.getSession>>
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

  app.use("*", async (c, next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    })
    c.set("session", session)
    return next()
  })

  app.get("/health", (c) => {
    return c.json({
      status: "ok",
    })
  })

  app.get("/info", async (c) => {
    const session = c.get("session")

    return c.json({
      status: "ok",
      session: session?.session,
      user: session?.user,
    })
  })

  // Routes
  app.get("/", (c) => {
    return c.text("Hello World")
  })

  app.notFound((c) => {
    console.log("Not Found", c.req.path)
    return c.json(
      {
        message: "Not Found",
      },
      404,
    )
  })

  app.onError((err, c) => {
    console.error(err)
    return c.json(
      {
        message: "Internal Server Error",
      },
      500,
    )
  })

  return app
}

export { handle as vercel } from "hono/vercel"
