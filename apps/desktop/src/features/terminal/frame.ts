/** Queue a full-frame reset with the bytes so pending xterm writes stay ordered. */
export function terminalFrame(data: string, full: boolean) {
  const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
  if (!full) return bytes;
  const frame = new Uint8Array(bytes.length + 2);
  frame.set([0x1b, 0x63]);
  frame.set(bytes, 2);
  return frame;
}
