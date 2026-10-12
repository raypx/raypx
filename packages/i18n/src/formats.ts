export const formats = {
  dateTime: {
    short: { dateStyle: "medium" },
  },
  list: {
    conjunction: { type: "conjunction" },
  },
  number: {
    compact: { notation: "compact" },
  },
  relativeTime: {
    numeric: { numeric: "auto" },
  },
} as const satisfies {
  dateTime: Record<string, Intl.DateTimeFormatOptions>;
  list: Record<string, Intl.ListFormatOptions>;
  number: Record<string, Intl.NumberFormatOptions>;
  relativeTime: Record<string, Intl.RelativeTimeFormatOptions>;
};
