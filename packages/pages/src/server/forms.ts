import { PageError, type PageFormFields } from "@raypx/core/pages";

const inputTypes = new Set(["text", "search", "email", "tel", "url", "number"]);

/** Work from the saved HTML version. Draft values are always literal text. */
export function fillPageForm(body: string, fields: PageFormFields): string {
  const remaining = new Map(fields.map(({ name, value }) => [name, value]));
  const visited = new Set<string>();
  const rendered = new HTMLRewriter()
    .on("form input[name], form textarea[name]", {
      element(element) {
        const name = element.getAttribute("name");
        if (!name || (!remaining.has(name) && !visited.has(name))) return;
        if (
          visited.has(name) ||
          element.hasAttribute("disabled") ||
          element.hasAttribute("readonly")
        )
          throw new PageError("PAGE_INVALID_INPUT");
        const value = remaining.get(name)!;
        remaining.delete(name);
        visited.add(name);
        if (element.tagName === "textarea") {
          element.setInnerContent(value, { html: false });
          return;
        }
        if (!inputTypes.has(element.getAttribute("type")?.toLowerCase() ?? "text"))
          throw new PageError("PAGE_INVALID_INPUT");
        // The rewriter escapes quotes in attributes but leaves ampersands as entities.
        element.setAttribute("value", value.replaceAll("&", "&amp;"));
      },
    })
    .transform(body);
  if (remaining.size) throw new PageError("PAGE_INVALID_INPUT");
  return rendered;
}
