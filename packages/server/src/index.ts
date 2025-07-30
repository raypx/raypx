import { Hono } from "hono"

const app = new Hono()

app.get("/", (c) => {
  return c.text("Hello World")
})

interface ServerOptions {
  prefix: string
}

export const createApp = (options: ServerOptions) => {
  const app = new Hono().basePath(options.prefix)

  app.get("/", (c) => {
    return c.text("Hello World")
  })

  return app
}

export { handle as vercel } from "hono/vercel"
