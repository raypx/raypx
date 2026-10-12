export function commandAfterSeparator(argv: readonly string[]): string[] {
  const separatorIndex = argv.indexOf("--");
  return separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);
}
