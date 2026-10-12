const inlineLink = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export interface MarkdownLink {
  /** Path relative to the repository root, fragment and query removed. */
  resolved: string;
  /** The target exactly as written, for error messages. */
  target: string;
}

/** Matches any URL scheme: `http:`, `https:`, `mailto:`, `tel:`, and so on. */
const scheme = /^[a-z][a-z0-9+.-]*:/i;

function isExternal(target: string): boolean {
  return target.startsWith("#") || target.startsWith("//") || scheme.test(target);
}

function normalize(segments: string[]): string {
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return stack.join("/");
}

/**
 * Collects the repository-relative targets of every local markdown link in one
 * file. Pure: resolution is string arithmetic, so callers decide what exists.
 */
export function collectRelativeLinks(location: string, content: string): MarkdownLink[] {
  const directory = location.includes("/") ? location.slice(0, location.lastIndexOf("/")) : "";
  const links: MarkdownLink[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(inlineLink)) {
    const target = match[1];
    if (!target || isExternal(target)) continue;

    const withoutFragment = target.split("#")[0]?.split("?")[0] ?? "";
    if (withoutFragment.length === 0) continue;

    const base = withoutFragment.startsWith("/")
      ? withoutFragment.slice(1).split("/")
      : [...(directory ? directory.split("/") : []), ...withoutFragment.split("/")];
    const resolved = normalize(base);
    if (resolved.length === 0 || seen.has(resolved)) continue;

    seen.add(resolved);
    links.push({ target, resolved });
  }

  return links;
}

/**
 * Walks a link graph breadth-first from one entry point. Reachability is
 * transitive so an index may delegate to a sub-index instead of listing every
 * document itself. Pure.
 */
export function reachableFrom(
  start: string,
  edges: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const visited = new Set<string>([start]);
  const queue = [start];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const next of edges.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }

  return visited;
}
