import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  createContext,
  Children,
  isValidElement,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { IconButton } from "@raypx/ui/icon-button";
import { CopyIcon } from "@raypx/icons/copy";
import { CheckIcon } from "@raypx/icons/check";

type CopyLabels = Omit<ReplyMarkdownProps, "children">;
const CopyContext = createContext<CopyLabels>({
  copyLabel: "",
  copiedLabel: "",
  copyErrorLabel: "",
});

const headingClassName = "mt-[1.25em] mb-[0.5em] font-semibold";
const tableCellClassName =
  "min-w-24 border border-border px-[0.75em] py-[0.4em] text-left wrap-normal break-normal";

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
  pre: CodeBlock,
  code: ({ children, className }) => (
    <code className={`font-mono text-[0.85em] ${className ?? ""}`}>{children}</code>
  ),
  table: ({ children }) => (
    <div className="my-[0.8em] max-w-full overflow-x-auto">
      <table className="w-max min-w-80 border-collapse wrap-normal break-normal">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className={tableCellClassName}>{children}</th>,
  td: ({ children }) => <td className={tableCellClassName}>{children}</td>,
  img: ({ alt }) => (alt ? <span className="text-muted-foreground">[{alt}]</span> : null),
  input: ({ checked }) => <span aria-label={checked ? "[x]" : "[ ]"}>{checked ? "☑" : "☐"}</span>,
};

/** Agent text is untrusted. No raw HTML, remote images, or executable URL schemes. */
export interface ReplyMarkdownProps {
  children: string;
  copyLabel: string;
  copiedLabel: string;
  copyErrorLabel: string;
}

function CodeBlock({ children }: ComponentProps<"pre">) {
  const { copyLabel, copiedLabel, copyErrorLabel } = useContext(CopyContext);
  const code = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const source = Children.toArray(children).find(isValidElement);
  let languageClass = "";
  if (
    source?.props &&
    typeof source.props === "object" &&
    "className" in source.props &&
    typeof source.props.className === "string"
  ) {
    languageClass = source.props.className;
  }
  const language = languageClass.match(/(?:^|\s)language-([^\s]+)/)?.[1] ?? "";
  useEffect(() => {
    queueMicrotask(() => setCopied(false));
  }, [children]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code.current?.textContent ?? "");
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
      const range = document.createRange();
      if (code.current) {
        range.selectNodeContents(code.current);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  }
  return (
    <div className="my-[0.8em] min-w-0 overflow-hidden rounded-xl border border-border/60 bg-muted/50">
      <div className="flex items-center justify-between gap-2 px-3 py-1">
        <span
          data-code-language
          className="min-w-0 truncate font-mono text-xs text-muted-foreground"
        >
          {language}
        </span>
        <IconButton
          size="icon-sm"
          label={copied ? copiedLabel : copyLabel}
          onClick={() => void copy()}
        >
          {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        </IconButton>
      </div>
      <pre
        ref={code}
        className="max-w-full overflow-x-auto p-4 whitespace-pre"
        onCopy={() => setCopied(true)}
      >
        {children}
      </pre>
      {failed && (
        <p role="status" className="px-4 pb-2 text-xs text-muted-foreground">
          {copyErrorLabel}
        </p>
      )}
    </div>
  );
}

export const ReplyMarkdown = memo(function ReplyMarkdown({
  children,
  copyLabel,
  copiedLabel,
  copyErrorLabel,
}: ReplyMarkdownProps) {
  const labels = useMemo(
    () => ({ copyLabel, copiedLabel, copyErrorLabel }),
    [copyLabel, copiedLabel, copyErrorLabel],
  );
  return (
    <div className="min-w-0 wrap-anywhere leading-[1.7] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&_:not(pre)>code]:rounded-[3px] [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-[0.3em] [&_:not(pre)>code]:py-[0.15em]">
      <CopyContext value={labels}>
        <Markdown skipHtml remarkPlugins={[remarkGfm]} components={components}>
          {children}
        </Markdown>
      </CopyContext>
    </div>
  );
});
