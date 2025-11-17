import { useTheme } from "@raypx/ui/hooks/use-theme";
import { useEffect, useState } from "react";

type CodeHighlighterProps = {
  code: string;
  language: "tsx" | "html" | "typescript";
};

export function CodeHighlighter({ code, language }: CodeHighlighterProps) {
  const { resolvedTheme } = useTheme();
  const [highlightedCode, setHighlightedCode] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      setLoading(true);
      try {
        // Dynamic import to handle shiki's ESM module
        const shiki = await import("shiki");
        const currentTheme = resolvedTheme === "dark" ? "github-dark" : "github-light";
        const html = await shiki.codeToHtml(code, {
          lang: language,
          theme: currentTheme,
        });

        if (!cancelled) {
          setHighlightedCode(html);
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to highlight code:", error);
        if (!cancelled) {
          // Fallback to plain text
          setHighlightedCode(`<pre><code>${escapeHtml(code)}</code></pre>`);
          setLoading(false);
        }
      }
    }

    highlight();

    return () => {
      cancelled = true;
    };
  }, [code, language, resolvedTheme]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-sm text-muted-foreground">Highlighting code...</div>
      </div>
    );
  }

  return (
    <div
      className="shiki-container [&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!m-0 [&_pre]:!overflow-visible [&_pre]:!text-xs [&_pre]:font-mono [&_pre_shiki]:!bg-transparent"
      dangerouslySetInnerHTML={{ __html: highlightedCode }}
    />
  );
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
