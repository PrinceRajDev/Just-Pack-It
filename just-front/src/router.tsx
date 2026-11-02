import { LoadingState } from "@/components/common/LoadingState";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPendingMs: 250,
    defaultPendingMinMs: 200,
    defaultPendingComponent: () => (
      <div className="mx-auto max-w-6xl p-5">
        <LoadingState />
      </div>
    ),
    defaultPreloadStaleTime: 0,
  });

  return router;
};
