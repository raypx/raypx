import { keepPreviousData, useQuery } from "@tanstack/react-query";

async function fetchSource(templateName: string): Promise<string> {
  const response = await fetch("/api/source", {
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
    throw new Error(result.error || "Failed to fetch source");
  }

  return result.source || "";
}

export function useSource(selectedTemplate: string) {
  const {
    data: source = "",
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ["source", selectedTemplate],
    queryFn: () => fetchSource(selectedTemplate),
    enabled: !!selectedTemplate,
    placeholderData: keepPreviousData, // Keep previous data while fetching new data
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Return error message if there's an error
  const errorSource = error
    ? `// Error loading source: ${error instanceof Error ? error.message : String(error)}`
    : "";

  return {
    source: errorSource || source,
    loading: isLoading || isFetching,
  };
}
