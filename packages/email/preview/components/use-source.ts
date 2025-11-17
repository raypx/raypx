import { useEffect, useState } from "react";

export function useSource(selectedTemplate: string) {
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedTemplate) {
      setSource("");
      return;
    }

    const fetchSource = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/source", {
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
          throw new Error(result.error || "Failed to fetch source");
        }

        setSource(result.source || "");
      } catch (error) {
        console.error("Failed to fetch source:", error);
        setSource(`// Error loading source: ${error}`);
      } finally {
        setLoading(false);
      }
    };

    fetchSource();
  }, [selectedTemplate]);

  return { source, loading };
}
