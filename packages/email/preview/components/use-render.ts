import { useEffect, useState } from "react";

export function useRender(selectedTemplate: string) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedTemplate) {
      setHtml("");
      return;
    }

    const renderEmail = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/render", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            templateName: selectedTemplate,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Failed to render email");
        }

        setHtml(result.html);
      } catch (error) {
        console.error("Failed to render email:", error);
        setHtml(`<div style="padding: 20px; color: red;">Error rendering email: ${error}</div>`);
      } finally {
        setLoading(false);
      }
    };

    renderEmail();
  }, [selectedTemplate]);

  return { html, loading };
}
