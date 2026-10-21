import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

/**
 * Shell-shaped loading state. Rendered while a route resolves so navigation
 * never flashes a blank white page.
 */
export function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-surface">
      <div className="h-11 w-full bg-ink" />
      <div className="h-9 w-full bg-ink-soft" />
      <div className="border-b border-border bg-background px-4 py-3">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-2 h-5 w-64" />
      </div>
      <div className="mx-auto w-full max-w-[1600px] space-y-3 px-4 py-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border border-border bg-card p-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-7 w-32" />
              <Skeleton className="mt-2 h-3 w-20" />
            </div>
          ))}
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <Skeleton className="h-4 w-48" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
