import { herdrError, record } from "./herdr-ipc";

/** Validate the public Herdr NDJSON frame before forwarding bytes to Desktop. */
export function herdrFrame(value: unknown, previous: number) {
  if (!record(value)) throw herdrError();
  if (value.type === "terminal.closed") return null;
  if (
    value.type !== "terminal.frame" ||
    value.encoding !== "ansi" ||
    typeof value.bytes !== "string" ||
    typeof value.full !== "boolean" ||
    !Number.isSafeInteger(value.seq) ||
    Number(value.seq) <= previous ||
    !Number.isInteger(value.width) ||
    !Number.isInteger(value.height) ||
    Number(value.width) < 1 ||
    Number(value.width) > 500 ||
    Number(value.height) < 1 ||
    Number(value.height) > 300 ||
    (previous === 0 && !value.full) ||
    (!value.full && Number(value.seq) !== previous + 1) ||
    value.bytes.length > 7 * 1024 * 1024
  )
    throw herdrError();
  if (Buffer.from(value.bytes, "base64").toString("base64") !== value.bytes) throw herdrError();
  return {
    seq: Number(value.seq),
    data: value.bytes,
    full: value.full,
    cols: Number(value.width),
    rows: Number(value.height),
  };
}
