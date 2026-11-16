import { createConversationFeed } from "@raypx/client/events";
import type { ConversationFeedFrame, ConversationFeedSelection } from "@raypx/contracts/api";

export function connectConversationFeed(origin: URL, selection: ConversationFeedSelection) {
  const frames: ConversationFeedFrame[] = [];
  const closed: number[] = [];
  const closeReasons: string[] = [];
  const connection = createConversationFeed(origin.origin).subscribe(selection, {
    onFrame: (frame) => frames.push(frame),
    onClose(code, reason) {
      closed.push(code ?? 1000);
      closeReasons.push(reason ?? "");
    },
    onError: () => closed.push(1006),
  });
  const events = () =>
    frames.flatMap((frame) => (frame.type === "event" ? [frame.entry.event] : []));
  return {
    frames,
    closed,
    closeReasons,
    close: connection.close,
    events,
    sequences: () => events().map((event) => event.sequence),
  };
}
