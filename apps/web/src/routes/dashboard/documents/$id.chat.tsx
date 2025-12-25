import { useAuth } from "@raypx/auth";
import { useTRPC } from "@raypx/trpc/client";
import { Button } from "@raypx/ui/components/button";
import { Card, CardContent } from "@raypx/ui/components/card";
import { IconArrowLeft, IconRobot } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EmptyState } from "~/components/empty-state";
import { ErrorState } from "~/components/error-state";
import { PageWrapper } from "~/components/page-wrapper";
import type { ChatStreamParams } from "~/features/chat";
import { ChatInterface } from "~/features/chat";
import { truncateTextMiddle } from "~/lib/dashboard-utils";

export const Route = createFileRoute("/dashboard/documents/$id/chat")({
  component: DocumentChatPage,
});

function DocumentChatPage() {
  const { id: documentId } = Route.useParams();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const {
    hooks: { useSession },
  } = useAuth();
  const { data: session } = useSession();
  const user = session?.user;

  const documentQuery = useQuery({
    ...trpc.documents.byId.queryOptions({ id: documentId }),
    enabled: !!documentId,
  });

  const document = documentQuery.data;

  const buildStreamParams = ({
    messages,
    conversationId,
  }: {
    messages: Array<{ role: string; content: string }>;
    conversationId?: string;
  }): ChatStreamParams => ({
    messages,
    documentId,
    maxChunks: 5,
    similarityThreshold: 0.1,
    temperature: 0.7,
    maxTokens: 2000,
    llmProvider: "aliyun",
    llmModel: "qwen3-max",
    conversationId,
    saveHistory: !!conversationId,
  });

  if (documentQuery.isPending) {
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

  if (documentQuery.isError || !document) {
    return (
      <PageWrapper spacing="lg">
        <ErrorState
          message={documentQuery.error?.message ?? "Document not found"}
          onRetry={() => {
            navigate({ to: "/dashboard/datasets" });
          }}
          retrying={documentQuery.isFetching}
        />
      </PageWrapper>
    );
  }

  const isVectorized = document.status === "completed";

  return (
    <PageWrapper spacing="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => navigate({ to: `/dashboard/datasets/${document.datasetId}/document` })}
              size="icon"
              variant="ghost"
            >
              <IconArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold truncate" title={document.name}>
                {truncateTextMiddle(document.name, 60, 25, 25)}
              </h1>
              <p className="text-sm text-muted-foreground">Chat with this document using AI</p>
            </div>
          </div>
        </div>

        {!isVectorized ? (
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardContent className="p-6">
              <EmptyState
                actionLabel="Go to Documents"
                description="Please vectorize this document first before you can chat with it."
                icon={IconRobot}
                onAction={() =>
                  navigate({ to: `/dashboard/datasets/${document.datasetId}/document` })
                }
                title="Document not vectorized"
              />
            </CardContent>
          </Card>
        ) : (
          <ChatInterface
            buildStreamParams={buildStreamParams}
            contextId={documentId}
            contextName={document.name}
            contextType="document"
            description="Ask questions about this document. The AI will search for relevant information and provide answers."
            emptyStateMessage="Start a conversation by asking a question about the document."
            enabled={isVectorized}
            placeholder="Ask a question about this document..."
            title="Document Chat"
            user={user}
          />
        )}
      </div>
    </PageWrapper>
  );
}
