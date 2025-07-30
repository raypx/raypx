"use client"

import { client, useSession } from "@raypx/auth/client"
import { useEffect, useState } from "react"
import { env } from "@/env"

const isEnabled = env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true"

function OneTap() {
  const session = useSession()
  const [taped, setTaped] = useState(false)

  useEffect(() => {
    if (!isEnabled) return
    if (!(session.data?.user || session.isPending || taped)) {
      client.oneTap()
      setTaped(true)
    }
  }, [session, taped])

  return null
}

export default OneTap
