import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, ArrowUp, ArrowDown, X, Rocket } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { QueueItem } from "@cwcm/types";
import safetyImg from "@/assets/wallpaper-safety.jpg";
import independenceImg from "@/assets/wallpaper-independence.jpg";
import anniversaryImg from "@/assets/wallpaper-anniversary.jpg";
import christmasImg from "@/assets/wallpaper-christmas.jpg";

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

const queue = [
  {
    pos: "NOW",
    name: "Safety Awareness 2026",
    when: "23 Jul – 31 Jul 2026",
    img: safetyImg,
    tone: "success",
  },
  {
    pos: "NEXT",
    name: "Independence Day",
    when: "1 Aug – 17 Aug 2026",
    img: independenceImg,
    tone: "info",
  },
  {
    pos: "NEXT",
    name: "Company Anniversary",
    when: "1 Sep – 7 Sep 2026",
    img: anniversaryImg,
    tone: "info",
  },
  {
    pos: "NEXT",
    name: "Christmas 2026",
    when: "20 Dec – 31 Dec 2026",
    img: christmasImg,
    tone: "info",
  },
];

function Page() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["queue"],
    queryFn: () => apiGet<{ items: QueueItem[]; state: string }>("/queue"),
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

  const queueRows = data?.items ?? queue;
  const queueState = data?.state ?? "RUNNING";

  function moveQueueItem(index: number, direction: -1 | 1) {
    if (!data?.items) {
      toast.info("Reorder is available for live queue only");
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
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="relative space-y-3">
          {queueRows.map((q, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-lg border border-border">
              <div
                className={`w-20 text-center text-xs font-bold py-1 rounded ${("positionLabel" in q ? q.positionLabel === "NOW" : q.pos === "NOW") ? "bg-success-soft text-success" : "bg-info-soft text-info"}`}
              >
                {"positionLabel" in q ? q.positionLabel : q.pos}
              </div>
              <img
                src={
                  "wallpaperUrl" in q && q.wallpaperUrl
                    ? q.wallpaperUrl
                    : i % 4 === 0
                      ? safetyImg
                      : i % 4 === 1
                        ? independenceImg
                        : i % 4 === 2
                          ? anniversaryImg
                          : christmasImg
                }
                alt={q.name}
                className="h-14 w-20 object-cover rounded-md"
              />
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{q.name}</div>
                <div className="text-xs text-muted-foreground">
                  {"scheduleLabel" in q ? q.scheduleLabel : q.when}
                </div>
              </div>
              {("positionLabel" in q ? q.positionLabel : q.pos) === "NOW" ? (
                <Badge className="bg-success-soft text-success hover:bg-success-soft">
                  Deploying
                </Badge>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => forceDeployMutation.mutate()}
                    disabled={forceDeployMutation.isPending}
                  >
                    <Rocket className="h-3.5 w-3.5 mr-1.5" />
                    {forceDeployMutation.isPending ? "Starting..." : "Force deploy"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => ("campaignId" in q ? removeMutation.mutate(q.campaignId) : null)}
                    disabled={!("campaignId" in q) || removeMutation.isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moveQueueItem(i, -1)}
                    disabled={!("campaignId" in q) || reorderMutation.isPending || i === 0}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => moveQueueItem(i, 1)}
                    disabled={
                      !("campaignId" in q) ||
                      reorderMutation.isPending ||
                      i === queueRows.length - 1
                    }
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
