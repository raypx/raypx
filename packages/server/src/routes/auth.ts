import { auth, supportedSocials } from "@raypx/auth"
import { format } from "date-fns"
import { Hono } from "hono"
import { UAParser } from "ua-parser-js"
import type { Variables } from "../types"

export const authRoutes = new Hono<{ Variables: Variables }>()

// Get Sessions
authRoutes.get("/sessions", async (c) => {
  const session = c.get("session")
  const res = await auth.api.listSessions({
    headers: c.req.raw.headers,
  })

  const data = res.map((item) => {
    const ua = UAParser(item.userAgent || "")

    return {
      ...item,
      deviceType: ua.device.type || "desktop",
      current: item.id === session?.id,
      os: ua.os.name || "",
      browser: ua.browser.name || "",
      location: item.ipAddress || "",
      lastActive: format(item.updatedAt, "yyyy-MM-dd HH:mm:ss"),
      deviceName: `${ua.os.name || ""} ${ua.browser.name || ""}`,
    }
  })

  return c.json({
    status: "ok",
    data,
  })
})

authRoutes.get("/socials", async (c) => {
  const socials = supportedSocials
  const accounts = await auth.api.listUserAccounts({
    headers: c.req.raw.headers,
  })

  // To ensure accounts with data come first without performance impact,
  // build a Map for O(1) lookups, then sort after mapping.
  const accountMap = new Map(accounts.map((a) => [a.provider, a]))
  const data = socials
    .map((social) => {
      const account = accountMap.get(social)
      if (account) {
        return { ...account }
      } else {
        return { provider: social }
      }
    })
    .sort((a, b) => {
      // Items with more account data (i.e., not just {provider}) come first
      const aHasData = Object.keys(a).length > 1
      const bHasData = Object.keys(b).length > 1
      return Number(bHasData) - Number(aHasData)
    })
  return c.json({
    status: "ok",
    data,
    socials,
  })
})

authRoutes.post("/revoke-session", async (c) => {
  const { token } = await c.req.json()
  const session = c.get("session")
  const res = await auth.api.revokeSession({
    headers: c.req.raw.headers,
    body: {
      token,
    },
  })

  console.log(session?.token, token)
  if (session?.token === token) {
    await auth.api.signOut({
      headers: c.req.raw.headers,
    })
  }

  return c.json(res)
})

export default authRoutes
