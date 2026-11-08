import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";

const headingClassName = "mt-[1.25em] mb-[0.5em] font-semibold";
const tableCellClassName = "border border-border px-[0.75em] py-[0.4em] text-left";

const components: Components = {
  p: ({ children }) => <p className="my-[0.8em]">{children}</p>,
  h1: ({ children }) => <h1 className={`${headingClassName} text-[1.25em]`}>{children}</h1>,
  h2: ({ children }) => <h2 className={`${headingClassName} text-[1.125em]`}>{children}</h2>,
  h3: ({ children }) => <h3 className={`${headingClassName} text-[1em]`}>{children}</h3>,
  h4: ({ children }) => <h4 className={`${headingClassName} text-[1em]`}>{children}</h4>,
  h5: ({ children }) => <h5 className={`${headingClassName} text-[1em]`}>{children}</h5>,
  h6: ({ children }) => <h6 className={`${headingClassName} text-[1em]`}>{children}</h6>,
  ul: ({ children }) => <ul className="my-[0.8em] list-disc pl-[1.5em]">{children}</ul>,
  ol: ({ children, start }) => (
    <ol start={start} className="my-[0.8em] list-decimal pl-[1.5em]">
      {children}
    </ol>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-[3px]"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-[0.8em] border-l-2 border-border pl-[1em] text-muted-foreground">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="my-[0.8em] overflow-x-auto rounded-sm bg-muted p-4 whitespace-pre">
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code className={`font-mono text-[0.85em] ${className ?? ""}`}>{children}</code>
  ),
  table: ({ children }) => (
    <table className="my-[0.8em] block max-w-full border-collapse overflow-x-auto">
      {children}
    </table>
  ),
  th: ({ children }) => <th className={tableCellClassName}>{children}</th>,
  td: ({ children }) => <td className={tableCellClassName}>{children}</td>,
  img: ({ alt }) => (alt ? <span className="text-muted-foreground">[{alt}]</span> : null),
  input: ({ checked }) => <span aria-label={checked ? "[x]" : "[ ]"}>{checked ? "☑" : "☐"}</span>,
};

/** Agent text is untrusted. No raw HTML, remote images, or executable URL schemes. */
export const TaskMarkdown = memo(function TaskMarkdown({ children }: { children: string }) {
  return (
    <div className="min-w-0 wrap-anywhere leading-[1.7] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_:not(pre)>code]:rounded-[3px] [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-[0.3em] [&_:not(pre)>code]:py-[0.15em]">
      <Markdown skipHtml remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </Markdown>
    </div>
  );
});
