/** Gate execution while keeping config discovery and test listing free of side effects. */
export default function setupLiveAcceptance() {
  if (process.env.RAYPX_LIVE_AGENTS !== "1")
    throw new Error(
      "Set RAYPX_LIVE_AGENTS=1 to run real inference against the configured HTTPS acceptance environment",
    );
}
