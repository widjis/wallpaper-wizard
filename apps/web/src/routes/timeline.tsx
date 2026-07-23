import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, ArrowUp, ArrowDown, X, Rocket } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canManageDeployments, canViewTimeline } from "@/lib/roles";
import { useProtectedImageUrls } from "@/lib/use-protected-image-urls";
import type { QueueItem } from "@cwcm/types";

export const Route = createFileRoute("/timeline")({
  head: () => ({
    meta: [
      { title: "Timeline & Queue — CWCM" },
      { name: "description", content: "View and reorder the wallpaper deployment queue." },
      { property: "og:title", content: "Timeline & Queue — CWCM" },
      { property: "og:description", content: "View and reorder the wallpaper deployment queue." },
    ],
  }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { data, isPending, error } = useQuery({
    queryKey: ["queue"],
    queryFn: () => apiGet<{ items: QueueItem[]; state: string }>("/queue"),
  });
  const canManage = canManageDeployments(session?.user.role);
  const queueRows = data?.items ?? [];
  const previewUrls = useProtectedImageUrls({
    items: queueRows,
    getId: (item) => item.id,
    getImageUrl: (item) => item.wallpaperUrl,
  });

  const pauseMutation = useMutation({
    mutationFn: () => apiPost("/queue/pause"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast.success("Queue paused");
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiPost("/queue/resume"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast.success("Queue resumed");
    },
  });

  const forceDeployMutation = useMutation({
    mutationFn: () => apiPost("/deployments/force"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployments"] });
      toast.success("Manual deployment triggered");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to trigger deployment");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (campaignId: string) => apiDelete(`/queue/${campaignId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Queue item removed");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to remove queue item");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (campaignIds: string[]) => apiPost("/queue/reorder", { campaignIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast.success("Queue order updated");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to reorder queue");
    },
  });

  const queueState = data?.state ?? "RUNNING";

  function moveQueueItem(index: number, direction: -1 | 1) {
    if (!data?.items?.length) {
      return;
    }

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= data.items.length) {
      return;
    }

    const reordered = [...data.items];
    const [item] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, item);
    reorderMutation.mutate(reordered.map((entry) => entry.campaignId));
  }

  if (!canViewTimeline(session?.user.role)) {
    return (
      <AppLayout title="Timeline & Queue" subtitle="Deployment order of upcoming campaigns">
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-sm text-muted-foreground">
          Your role does not have access to the deployment queue.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Timeline & Queue" subtitle="Deployment order of upcoming campaigns">
      <div className="flex items-center gap-3 mb-6">
        <div>
          <div className="text-sm text-muted-foreground">Queue Status</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="font-semibold">{queueState}</span>
          </div>
        </div>
        <div className="flex-1" />
        {canManage ? (
          <>
            <Button
              variant="outline"
              onClick={() => forceDeployMutation.mutate()}
              disabled={forceDeployMutation.isPending}
            >
              <Rocket className="h-4 w-4 mr-2" />
              {forceDeployMutation.isPending ? "Starting..." : "Force deploy now"}
            </Button>
            {queueState === "RUNNING" ? (
              <Button
                variant="outline"
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
              >
                <Pause className="h-4 w-4 mr-2" />
                {pauseMutation.isPending ? "Pausing..." : "Pause Queue"}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
              >
                <Play className="h-4 w-4 mr-2" />
                {resumeMutation.isPending ? "Resuming..." : "Resume"}
              </Button>
            )}
          </>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        {isPending ? (
          <div className="text-sm text-muted-foreground">Loading queue...</div>
        ) : error ? (
          <div className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load queue."}
          </div>
        ) : queueRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            Queue is empty right now.
          </div>
        ) : (
          <div className="relative space-y-3">
            {queueRows.map((q, i) => (
              <div
                key={q.id}
                className="flex items-center gap-4 p-4 rounded-lg border border-border"
              >
                <div
                  className={`w-20 text-center text-xs font-bold py-1 rounded ${q.positionLabel === "NOW" ? "bg-success-soft text-success" : "bg-info-soft text-info"}`}
                >
                  {q.positionLabel}
                </div>
                {previewUrls[q.id] ? (
                  <img
                    src={previewUrls[q.id]}
                    alt={q.name}
                    className="h-14 w-20 object-cover rounded-md"
                  />
                ) : (
                  <div className="h-14 w-20 rounded-md bg-muted flex items-center justify-center text-[11px] text-muted-foreground">
                    Preview
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{q.name}</div>
                  <div className="text-xs text-muted-foreground">{q.scheduleLabel}</div>
                </div>
                {q.positionLabel === "NOW" ? (
                  <Badge className="bg-success-soft text-success hover:bg-success-soft">
                    Deploying
                  </Badge>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeMutation.mutate(q.campaignId)}
                      disabled={!canManage || removeMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => moveQueueItem(i, -1)}
                      disabled={!canManage || reorderMutation.isPending || i === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => moveQueueItem(i, 1)}
                      disabled={
                        !canManage || reorderMutation.isPending || i === queueRows.length - 1
                      }
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
