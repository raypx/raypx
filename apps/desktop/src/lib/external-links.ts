/** Return only external HTTP(S) destinations; router links stay in the WebView. */
export function externalLinkTarget(event: MouseEvent, origin: string): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  const anchor =
    event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!anchor || !/^https?:/.test(anchor.href) || anchor.origin === origin) return null;
  return anchor.href;
}
