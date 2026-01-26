import { createFileRoute } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";
import { RoundedButton } from "../components/RoundedButton";

export const Home: React.FC = () => {
  const [greeted, setGreeted] = useState<string | null>(null);

  const greet = useCallback((): void => {
    invoke<string>("greet")
      .then((s) => {
        setGreeted(s);
      })
      .catch((err: unknown) => {
        console.error(err);
      });
  }, []);

  return (
    <div className="font-(family-name:--font-inter-sans) grid min-h-screen grid-rows-[20px_1fr_20px] items-center justify-items-center gap-16 p-8 pb-20 sm:p-20">
      <main className="row-start-2 flex flex-col items-center gap-8 sm:items-start">
        <div className="flex flex-row items-center gap-2">Raypx</div>
      </main>
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: Home,
});
