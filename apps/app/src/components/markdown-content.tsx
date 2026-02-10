import { cn } from "@raypx/ui/lib/utils";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
// Import highlight.js styles conditionally based on theme
// Using a neutral theme that works in both light and dark modes
import "highlight.js/styles/github.css";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none", className)}>
      <ReactMarkdown
        components={{
          // Customize code blocks
          code({ node, className: codeClassName, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName || "");
            const isInline = !match;
            return !isInline ? (
              <pre className="overflow-x-auto rounded-md bg-muted p-4">
                <code className={codeClassName} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className="rounded bg-muted px-1.5 py-0.5 text-sm" {...props}>
                {children}
              </code>
            );
          },
          // Customize headings
          h1: ({ node, ...props }) => <h1 className="mt-6 mb-4 font-bold text-2xl" {...props} />,
          h2: ({ node, ...props }) => <h2 className="mt-5 mb-3 font-semibold text-xl" {...props} />,
          h3: ({ node, ...props }) => <h3 className="mt-4 mb-2 font-semibold text-lg" {...props} />,
          // Customize paragraphs
          p: ({ node, ...props }) => <p className="mb-3 last:mb-0" {...props} />,
          // Customize lists
          ul: ({ node, ...props }) => (
            <ul className="mb-3 list-inside list-disc space-y-1" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="mb-3 list-inside list-decimal space-y-1" {...props} />
          ),
          // Customize links
          a: ({ node, ...props }) => (
            <a className="text-primary underline hover:text-primary/80" {...props} />
          ),
          // Customize blockquotes
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="my-3 border-muted-foreground/50 border-l-4 pl-4 italic"
              {...props}
            />
          ),
          // Customize tables
          table: ({ node, ...props }) => (
            <div className="my-4 overflow-x-auto">
              <table className="border-collapse border border-border" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="border border-border bg-muted px-4 py-2 font-semibold" {...props} />
          ),
          td: ({ node, ...props }) => <td className="border border-border px-4 py-2" {...props} />,
        }}
        rehypePlugins={[rehypeHighlight]}
        remarkPlugins={[remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
