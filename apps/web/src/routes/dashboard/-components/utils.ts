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
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};
