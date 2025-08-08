import { useContext } from "react"
import { AuthContext } from "./lib/auth-provider"

export * from "./auth.client"

export const useAuth = () => useContext(AuthContext)
