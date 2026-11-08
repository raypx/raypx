/** Each entry owns its signal listeners; disposing never closes another owner. */
export function onShutdown(stop: (signal: "SIGINT" | "SIGTERM") => void) {
  const interrupt = () => stop("SIGINT");
  const terminate = () => stop("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  return () => {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  };
}
