import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";

const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ alt }) => (alt ? <span className="text-muted-foreground">[{alt}]</span> : null),
  input: ({ checked }) => <span aria-label={checked ? "[x]" : "[ ]"}>{checked ? "☑" : "☐"}</span>,
};

/** Agent text is untrusted. No raw HTML, remote images, or executable URL schemes. */
export const TaskMarkdown = memo(function TaskMarkdown({ children }: { children: string }) {
  return (
    <div className="task-markdown">
      <Markdown skipHtml remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </Markdown>
    </div>
  );
});
