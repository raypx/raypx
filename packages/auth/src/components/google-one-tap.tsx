"use client"

import { client, useSession } from "@raypx/auth/client"
import { memo, useEffect, useState } from "react"
import { envs } from "../envs"

const env = envs()

const isEnabled =
  env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true" &&
  process.env.NODE_ENV === "production"

interface GoogleOneTapProps {
  cancelOnTapOutside?: boolean
}

export const GoogleOneTap = memo(function GoogleOneTap({
  cancelOnTapOutside,
}: GoogleOneTapProps) {
  const session = useSession()
  const [taped, setTaped] = useState(false)
  console.log("cancelOnTapOutside", cancelOnTapOutside)

  useEffect(() => {
    if (!isEnabled) return
    if (!(session.data?.user || session.isPending || taped)) {
      client.oneTap()
      setTaped(true)
    }
  }, [session, taped])

  return null
})

GoogleOneTap.displayName = "GoogleOneTap"

export default GoogleOneTap
