import {
  useCallback,
  useContext,
  useEffect,
  useState,
  useTransition,
} from "react"
import { AuthContext } from "../components/auth-provider"
import { getSearchParam } from "../shared/utils"

export function useOnSuccessTransition({
  redirectTo: redirectToProp,
}: {
  redirectTo?: string
}) {
  const { redirectTo: contextRedirectTo } = useContext(AuthContext)

  const getRedirectTo = useCallback(
    () => redirectToProp || getSearchParam("redirectTo") || contextRedirectTo,
    [redirectToProp, contextRedirectTo],
  )

  const [isPending, startTransition] = useTransition()
  const [success, setSuccess] = useState(false)

  const {
    navigate,
    hooks: { useSession },
    onSessionChange,
  } = useContext(AuthContext)

  const { refetch: refetchSession } = useSession()

  useEffect(() => {
    if (!success || isPending) return

    startTransition(() => {
      navigate(getRedirectTo())
    })
  }, [success, isPending, navigate, getRedirectTo])

  const onSuccess = useCallback(async () => {
    await refetchSession?.()
    setSuccess(true)

    if (onSessionChange) startTransition(onSessionChange)
  }, [refetchSession, onSessionChange])

  return { onSuccess, isPending }
}
