export interface FilesSearch {
  rootId?: string;
  path?: string;
  offset?: number;
}

export function filesSearch(search: Record<string, unknown> | FilesSearch): FilesSearch {
  return {
    ...(search.rootId === undefined
      ? {}
      : { rootId: typeof search.rootId === "string" ? search.rootId : "" }),
    ...(search.path === undefined
      ? {}
      : { path: typeof search.path === "string" ? search.path : "" }),
    ...(search.offset === undefined
      ? {}
      : {
          offset:
            typeof search.offset === "number" &&
            Number.isSafeInteger(search.offset) &&
            search.offset > 0
              ? search.offset
              : 0,
        }),
  };
}
