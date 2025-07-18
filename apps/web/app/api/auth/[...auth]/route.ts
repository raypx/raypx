import { toNextJsHandler } from "@raypx/auth"
import { auth } from "@raypx/auth"

const handler = toNextJsHandler(auth)

export const { GET, POST } = handler
