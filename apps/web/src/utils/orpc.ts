import { createClient, createQueryUtils } from "@raypx/rpc/client";
import { toast } from "@raypx/ui/components/toast";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { env } from "../env";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      toast.error(`Error: ${error.message}`, {
        action: {
          label: "retry",
          onClick: query.invalidate,
        },
      });
    },
  }),
});

const client = createClient({ baseUrl: env.VITE_AUTH_URL });

export const orpc = createQueryUtils(client);
