import { useMemo } from "react"

import type { AuthHooks } from "../../types/auth-hooks"
import { getModelName } from "./model-names"
import { useConditionalQuery } from "./use-conditional-query"
import type { UseTriplitOptionsProps } from "./use-triplit-hooks"
import { useTriplitToken } from "./use-triplit-token"

export function useListAccounts({
  triplit,
  modelNames,
  usePlural,
  isPending,
}: UseTriplitOptionsProps): ReturnType<AuthHooks["useListAccounts"]> {
  const modelName = getModelName({
    namespace: "account",
    modelNames,
    usePlural,
  })

  const { payload } = useTriplitToken(triplit)

  const { results, error, fetching } = useConditionalQuery(
    triplit,
    payload?.sub && triplit.query(modelName),
  )

  const accounts = useMemo(() => {
    return results?.map((account) => ({
      accountId: account.accountId as string,
      provider: account.providerId as string,
    }))
  }, [results])

  return {
    data: accounts,
    isPending: isPending || fetching,
    error,
  }
}
