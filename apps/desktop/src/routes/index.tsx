import { createFileRoute } from "@tanstack/react-router";

export const Home: React.FC = () => {
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
