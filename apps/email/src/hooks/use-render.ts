import { keepPreviousData, useQuery } from "@tanstack/react-query";

async function renderEmail(templateName: string): Promise<string> {
  const response = await fetch("/api/render", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      templateName,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Failed to render email");
  }

  return result.html;
}

export function useRender(selectedTemplate: string) {
  const {
    data: html = "",
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ["render", selectedTemplate],
    queryFn: () => renderEmail(selectedTemplate),
    enabled: !!selectedTemplate,
    placeholderData: keepPreviousData, // Keep previous data while fetching new data
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Return error HTML if there's an error
  const errorHtml = error
    ? `<div style="padding: 20px; color: red;">Error rendering email: ${error instanceof Error ? error.message : String(error)}</div>`
    : "";

  return {
    html: errorHtml || html,
    loading: isLoading || isFetching,
  };
}
