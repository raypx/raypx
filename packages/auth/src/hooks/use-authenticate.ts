import { useContext, useEffect } from "react"
import { AuthContext } from "../components/auth-provider"
import type { Page } from "../shared/pages"
import type { AnyAuthClient } from "../types/any-auth-client"

interface AuthenticateOptions<TAuthClient extends AnyAuthClient> {
  authClient?: TAuthClient
  page?: Page
  enabled?: boolean
}

export function useAuthenticate<TAuthClient extends AnyAuthClient>(
  options?: AuthenticateOptions<TAuthClient>,
) {
  type Session = TAuthClient["$Infer"]["Session"]["session"]
  type User = TAuthClient["$Infer"]["Session"]["user"]

  const { page = "SIGN_IN", enabled = true } = options ?? {}

  const {
    hooks: { useSession },
    basePath,
    pages,
    replace,
  } = useContext(AuthContext)

  const { data, isPending, error, refetch } = useSession()
  const sessionData = data as
    | {
        session: Session
        user: User
      }
    | null
    | undefined

  useEffect(() => {
    if (!enabled || isPending || sessionData) return

    replace(
      `${basePath}/${pages[page]}?redirectTo=${window.location.href.replace(window.location.origin, "")}`,
    )
  }, [isPending, sessionData, basePath, pages, replace, page, enabled])

  return {
    data: sessionData,
    user: sessionData?.user,
    isPending,
    error,
    refetch,
  }
}
