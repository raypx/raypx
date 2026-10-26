import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { LoadingState } from "@raypx/ui/loading-state";
import { TaskComposer } from "@raypx/tasks/client/task-composer";
import type { TaskWorkspaceClient } from "@raypx/tasks/client";
import { SignInLink } from "../auth/components/session-boundary";
import { saveGuestDraft, writeGuestDraft, useGuestDraft } from "./guest-draft";

export function GuestTasks({
  client,
  namespace,
}: {
  client: TaskWorkspaceClient;
  namespace: string;
}) {
  const t = useTranslations("tasks");
  const g = useTranslations("guest");
  const navigate = useNavigate();
  const href = useLocation({ select: (location) => location.href });
  const prompt = useRef<HTMLTextAreaElement>(null);
  const [options, setOptions] = useState(false);
  const resume = useGuestDraft(namespace);
  return (
    <section className="@container mx-auto max-w-[1400px] px-8 py-7 max-[760px]:px-5">
      <header className="mb-7">
        <p className="mb-2 text-sm text-muted-foreground">{g("visitor")}</p>
        <h1>{t("title")}</h1>
        <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{g("tasksHint")}</p>
      </header>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {!resume.ready ? (
          <LoadingState label={g("restoring")} />
        ) : (
          <div className="min-w-0">
            {resume.failed && (
              <p role="alert" className="mb-3 text-sm text-destructive-text">
                {g("restoreFailed")}
              </p>
            )}
            <TaskComposer
              client={client}
              devices={[]}
              tasks={[]}
              local={false}
              draftKey={JSON.stringify(["raypx.task-drafts.v1", namespace, "guest", false])}
              initialDraft={resume.draft}
              onDraftRestored={resume.restored}
              onCreated={() => {}}
              optionsOpen={options}
              onOptionsOpenChange={setOptions}
              promptRef={prompt}
              guest={{
                changed: (draft) => {
                  writeGuestDraft(namespace, draft, href);
                },
                signIn: async (draft) => {
                  const returnTo = saveGuestDraft(namespace, draft, href);
                  await navigate({ to: "/login", search: { returnTo } });
                },
              }}
            />
          </div>
        )}
        <section className="min-w-0 border-t border-border pt-6 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
          <h2 className="text-base font-semibold">{g("history")}</h2>
          <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{g("historyHint")}</p>
          <div className="mt-5">
            <SignInLink>{g("viewTasks")}</SignInLink>
          </div>
          <div className="mt-8 space-y-3 border-t border-border pt-6">
            <h3 className="text-sm font-medium">{g("computers")}</h3>
            <p className="max-w-[65ch] text-sm text-muted-foreground">{g("computersHint")}</p>
            <Button
              variant="outline"
              render={<Link to="/login" search={{ returnTo: "/settings" }} />}
            >
              {g("connect")}
            </Button>
          </div>
        </section>
      </div>
    </section>
  );
}
