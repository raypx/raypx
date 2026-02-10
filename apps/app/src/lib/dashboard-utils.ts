import dayjs from "dayjs";

export const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return "Never";
  return dayjs(date).format("MMM D, YYYY");
};

export const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

/**
 * Truncate text in the middle, keeping the beginning and end visible
 * @param text - The text to truncate
 * @param maxLength - Maximum length of the result (default: 50)
 * @param startLength - Length of the start portion (default: 20)
 * @param endLength - Length of the end portion (default: 20)
 * @returns Truncated text with ellipsis in the middle
 */
export const truncateTextMiddle = (
  text: string,
  maxLength = 50,
  startLength = 20,
  endLength = 20,
): string => {
  if (!text || text.length <= maxLength) {
    return text;
  }

  // If the text is shorter than start + end + ellipsis, just truncate normally
  if (text.length <= startLength + endLength + 3) {
    return `${text.slice(0, maxLength - 3)}...`;
  }

  // Extract file extension if present (for filenames)
  const lastDotIndex = text.lastIndexOf(".");
  let extension = "";
  let nameWithoutExt = text;

  if (lastDotIndex > 0 && lastDotIndex > text.length - 10) {
    // Likely a file extension
    extension = text.slice(lastDotIndex);
    nameWithoutExt = text.slice(0, lastDotIndex);
  }

  // Adjust endLength to account for extension
  const adjustedEndLength = extension ? endLength - extension.length : endLength;

  // Truncate the middle part
  const start = nameWithoutExt.slice(0, startLength);
  const end = nameWithoutExt.slice(-adjustedEndLength);
  const truncated = `${start}...${end}${extension}`;

  return truncated;
};
