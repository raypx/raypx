import type { ReactNode } from "react";

/**
 * One pane at a time: the project's composer and session history, or the open session.
 * The shell sidebar lists recent sessions, so the page no longer splits list and detail;
 * both panes share one reading column.
 */
export function TaskPanels({
  list,
  detail,
  detailVisible,
}: {
  list: ReactNode;
  detail: ReactNode;
  detailVisible: boolean;
}) {
  return (
    <div data-task-panels className="mx-auto flex w-full max-w-4xl min-w-0 flex-col">
      <div data-task-pane="list" hidden={detailVisible} className="min-w-0 space-y-6">
        {list}
      </div>
      <div data-task-pane="detail" hidden={!detailVisible} className="min-w-0">
        {detail}
      </div>
    </div>
  );
}
