import { auth } from "@raypx/auth"
import { db } from "@raypx/db"
import { Hono } from "hono"
import { compress } from "hono/compress"
import { contextStorage } from "hono/context-storage"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { prettyJSON } from "hono/pretty-json"
import { requestId } from "hono/request-id"
import { authRoutes } from "./routes/auth"
import type { ServerOptions, Variables } from "./types"

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
    if (session) {
      c.set("session", session.session)
      c.set("user", session.user)
    }
    return next()
  })

  app.get("/health", (c) => {
    return c.json({
      status: "ok",
    })
  })

  // Auth Routes
  app.route("/auth", authRoutes)

  app.get("/info", async (c) => {
    const session = c.get("session")
    const user = c.get("user")

    return c.json({
      status: "ok",
      session: session,
      user: user,
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
