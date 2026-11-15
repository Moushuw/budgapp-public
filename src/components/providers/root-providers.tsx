"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import dynamic from "next/dynamic";
import { Suspense, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePositionDesToasts } from "./position-des-toasts";

const ReactQueryDevtools = dynamic(
  () => import("@tanstack/react-query-devtools").then((mod) => ({ default: mod.ReactQueryDevtools })),
  { ssr: false },
);

export function RootProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const positionToasts = usePositionDesToasts();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position={positionToasts} />
      </ThemeProvider>
      {process.env.NODE_ENV !== "production" && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
