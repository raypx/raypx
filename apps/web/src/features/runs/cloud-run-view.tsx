import { CloudArtifacts } from "../files/cloud-artifacts";
import { CloudRunPanel } from "./cloud-run-panel";
import { useCloudRunController, type CloudRunControllerOptions } from "./use-cloud-run-controller";

/** Connected composition: the controller owns I/O; panels receive snapshots and actions. */
export function CloudRunView({
  writable,
  showOutput = false,
  ...options
}: CloudRunControllerOptions & { writable: boolean; showOutput?: boolean }) {
  const controller = useCloudRunController(options);
  return (
    <CloudRunPanel
      controller={controller}
      writable={writable}
      showOutput={showOutput}
      files={
        controller.snapshot.data ? (
          <CloudArtifacts api={options.api} artifacts={controller.snapshot.data.artifacts} />
        ) : null
      }
    />
  );
}
