import { useHealthCheck } from "@raypx/hooks/health";
import { Button, ConnectionStatus } from "@raypx/ui";

export function App() {
  const { status, retry } = useHealthCheck();

  return (
    <main>
      <h1>Raypx</h1>
      <p>Project ready, start building from here.</p>
      <section aria-labelledby="connection-heading">
        <h2 id="connection-heading">Service Connection</h2>
        <ConnectionStatus status={status} />
        <Button disabled={status === "loading"} onClick={retry}>
          Retry Connection
        </Button>
      </section>
    </main>
  );
}
