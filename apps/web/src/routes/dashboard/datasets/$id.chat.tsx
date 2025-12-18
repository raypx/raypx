import { useAuth } from "@raypx/auth";
import { useTRPC } from "@raypx/trpc/client";
import { Button } from "@raypx/ui/components/button";
import { Card, CardContent } from "@raypx/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ErrorState } from "~/components/error-state";
import { PageWrapper } from "~/components/page-wrapper";
import type { ChatStreamParams } from "~/features/chat";
import { ChatInterface } from "~/features/chat";
import { truncateTextMiddle } from "~/lib/dashboard-utils";

export const Route = createFileRoute("/dashboard/datasets/$id/chat")({
  component: DatasetChatPage,
});

function DatasetChatPage() {
  const { id: datasetId } = Route.useParams();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const {
    hooks: { useSession },
  } = useAuth();
  const { data: session } = useSession();
  const user = session?.user;

  const datasetQuery = useQuery({
    ...trpc.datasets.byId.queryOptions({ id: datasetId }),
    enabled: !!datasetId,
  });

  const dataset = datasetQuery.data;

  const buildStreamParams = ({
    messages,
    conversationId,
  }: {
    messages: Array<{ role: string; content: string }>;
    conversationId?: string;
  }): ChatStreamParams => ({
    messages,
    datasetId,
    maxChunks: 5,
    similarityThreshold: 0.1,
    temperature: 0.7,
    maxTokens: 2000,
    llmProvider: "aliyun",
    llmModel: "qwen3-max",
    conversationId,
    saveHistory: !!conversationId,
  });

  if (datasetQuery.isPending) {
    return (
      <PageWrapper spacing="lg">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">Loading...</div>
          </CardContent>
        </Card>
      </PageWrapper>
    );
  }

  if (datasetQuery.isError || !dataset) {
    return (
      <PageWrapper spacing="lg">
        <ErrorState
          message={datasetQuery.error?.message ?? "Dataset not found"}
          onRetry={() => {
            navigate({ to: "/dashboard/datasets" });
          }}
          retrying={datasetQuery.isFetching}
        />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper spacing="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => navigate({ to: `/dashboard/datasets/${datasetId}/document` })}
              size="icon"
              variant="ghost"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold truncate">
                {truncateTextMiddle(dataset.name, 60)}
              </h1>
              <p className="text-sm text-muted-foreground">Chat with dataset</p>
            </div>
          </div>
        </div>

        <ChatInterface
          buildStreamParams={buildStreamParams}
          contextId={datasetId}
          contextName={dataset.name}
          contextType="dataset"
          description="Ask questions about documents in this dataset"
          emptyStateMessage="Start a conversation by asking a question about the dataset."
          enabled={!!dataset}
          placeholder="Ask a question about this dataset..."
          title="Chat"
          user={user}
        />
      </div>
    </PageWrapper>
  );
}
