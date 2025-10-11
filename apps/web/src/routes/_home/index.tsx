import { Button } from "@raypx/ui/components/button";
import { toast } from "@raypx/ui/components/toast";
import { createFileRoute } from "@tanstack/react-router";

function HomePage() {
  const onClick = () => {
    toast.success("Hello");
  };
  return (
    <div className="min-h-screen">
      <Button onClick={onClick}>Click me</Button>
    </div>
  );
}

export const Route = createFileRoute("/_home/")({
  component: HomePage,
});
