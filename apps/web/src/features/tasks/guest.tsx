import { useRef, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { History } from "lucide-react";
import { LoadingState } from "@raypx/ui/loading-state";
import { TaskComposer } from "@raypx/tasks/client/task-composer";
import type { TaskWorkspacePort } from "@raypx/tasks/model";
import { SignInLink } from "../auth/components/session-boundary";
import { saveGuestDraft, writeGuestDraft, useGuestDraft } from "./guest-draft";

export function GuestTasks({
  client,
  namespace,
}: {
  client: TaskWorkspacePort;
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
    <section className="@container">
      <header className="mb-6">
        <h1>{t("title")}</h1>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">{g("tasksHint")}</p>
      </header>
      <div className="grid items-start gap-6 @3xl/main:grid-cols-[minmax(0,1fr)_20rem]">
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
        <aside className="min-w-0 rounded-xl border border-border p-5">
          <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
            <History aria-hidden="true" className="size-4.5" />
          </span>
          <h2 className="mt-3 text-base font-semibold">{g("history")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{g("historyHint")}</p>
          <div className="mt-4">
            <SignInLink>{g("viewTasks")}</SignInLink>
          </div>
        </aside>
      </div>
    </section>
  );
}
