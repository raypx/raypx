import type { Get } from "type-fest"
import type { useSession } from "./client"

export type UseSessionResult = ReturnType<typeof useSession>

export type Session = UseSessionResult["data"]
export type User = Get<Session, "user">
