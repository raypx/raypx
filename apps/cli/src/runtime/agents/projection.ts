// The first record always passes so cursors advance past oversized events.
// Unordered sets skip a record that does not fit instead of hiding the rest.
export function bounded<T>(records: T[], skip = false, budget = 256 * 1024): T[] {
  let bytes = 0;
  const result: T[] = [];
  for (const record of records) {
    const size = Buffer.byteLength(JSON.stringify(record));
    if (result.length && bytes + size > budget) {
      if (skip) continue;
      break;
    }
    result.push(record);
    bytes += size;
  }
  return result;
}
