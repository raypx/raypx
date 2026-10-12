import type { UserListInput } from "./types";
export function directorySearch(input: Record<string, unknown>): UserListInput {
  const query = typeof input.query === "string" ? input.query.slice(0, 200) : "";
  const role =
    input.role === "owner" || input.role === "admin" || input.role === "user"
      ? input.role
      : undefined;
  const status =
    input.status === "active" || input.status === "suspended" ? input.status : undefined;
  const cursor = typeof input.cursor === "string" && input.cursor ? input.cursor : undefined;
  return {
    ...(query ? { query } : {}),
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(cursor ? { cursor } : {}),
  };
}
