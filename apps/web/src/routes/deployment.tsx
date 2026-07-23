import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Rocket, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiPost, formatDateTime } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canManageDeployments } from "@/lib/roles";
import { useProtectedImageUrls } from "@/lib/use-protected-image-urls";
import type { AppSettings, DeploymentLogItem } from "@cwcm/types";

export const Route = createFileRoute("/deployment")({
  head: () => ({
    meta: [
      { title: "Deployment — CWCM" },
      {
        name: "description",
        content: "Monitor the current wallpaper deployment and SYSVOL publishing status.",
      },
      { property: "og:title", content: "Deployment — CWCM" },
      {
        property: "og:description",
        content: "Monitor the current wallpaper deployment and SYSVOL publishing status.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { data, isPending, error } = useQuery({
    queryKey: ["deployments"],
    queryFn: () => apiGet<{ items: DeploymentLogItem[] }>("/deployments"),
  });
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<AppSettings>("/settings"),
  });
  const canManage = canManageDeployments(session?.user.role);

  const latest = data?.items[0];
  const previewUrls = useProtectedImageUrls({
    items: latest ? [latest] : [],
    getId: (item) => item.id,
    getImageUrl: (item) => item.wallpaperImageUrl,
  });
  const steps = latest
    ? [
        { label: "Locate wallpaper", done: Boolean(latest.wallpaperId) },
        {
          label: "Validate file & checksum",
          done: Boolean(latest.verifiedChecksumSha256 || latest.verifiedSizeBytes),
        },
        { label: "Copy to SYSVOL", done: latest.result !== "FAILED" || latest.verifiedExists },
        {
          label: `Replace ${latest.targetFilename || settingsQuery.data?.wallpaperFilename || "Wallpaper.jpg"}`,
          done: latest.result !== "FAILED" || latest.verifiedExists,
        },
        { label: "Verify deployment", done: latest.verifiedExists },
        { label: "Write deployment log", done: Boolean(latest.finishedAt) },
      ]
    : [];

  const verifyMutation = useMutation({
    mutationFn: () =>
      latest
        ? apiPost(`/deployments/${latest.id}/verify`)
        : Promise.reject(new Error("No deployment available to verify")),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployments"] });
      toast.success("SYSVOL verification completed");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Verification failed");
    },
  });

  const forceMutation = useMutation({
    mutationFn: () => apiPost("/deployments/force"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deployments"] });
      queryClient.invalidateQueries({ queryKey: ["history"] });
      toast.success("Manual deployment triggered");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Deployment trigger failed");
    },
  });

  if (!canManage) {
    return (
      <AppLayout title="Deployment" subtitle="Current deployment engine status">
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-sm text-muted-foreground">
          Your role does not have access to deployment controls.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Deployment" subtitle="Current deployment engine status">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-sm text-muted-foreground">Latest Deployment</div>
              <h2 className="text-lg font-bold mt-0.5">
                {latest?.campaignName ?? "No deployment yet"}
              </h2>
            </div>
            <Badge className="bg-success-soft text-success hover:bg-success-soft">
              {latest?.result ?? "Idle"}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {latest ? (
              previewUrls[latest.id] ? (
                <img
                  src={previewUrls[latest.id]}
                  alt={latest.wallpaperTitle}
                  className="rounded-lg w-full h-48 object-cover"
                />
              ) : (
                <div className="rounded-lg w-full h-48 border border-dashed border-border bg-muted flex items-center justify-center text-sm text-muted-foreground">
                  Loading wallpaper preview...
                </div>
              )
            ) : (
              <div className="rounded-lg w-full h-48 border border-dashed border-border bg-muted flex items-center justify-center text-sm text-muted-foreground">
                No deployment preview available.
              </div>
            )}
            <dl className="space-y-2.5 text-sm">
              <Row label="Wallpaper" value={latest?.wallpaperTitle ?? "—"} />
              <Row
                label="Source"
                value={
                  latest
                    ? latest.sourceType === "DEFAULT_WALLPAPER"
                      ? "Default wallpaper"
                      : "Campaign"
                    : "—"
                }
              />
              <Row
                label="Target"
                value={latest?.targetPath ?? settingsQuery.data?.sysvolPath ?? "—"}
              />
              <Row
                label="Filename"
                value={latest?.targetFilename ?? settingsQuery.data?.wallpaperFilename ?? "—"}
              />
              <Row label="Result" value={latest?.result ?? "—"} />
              <Row label="Message" value={latest?.message ?? "—"} />
              <Row label="Started" value={formatDateTime(latest?.startedAt)} />
              <Row label="Finished" value={formatDateTime(latest?.finishedAt)} />
              <Row
                label="Duration"
                value={latest?.durationSeconds ? `${latest.durationSeconds} s` : "—"}
              />
              <Row
                label="Verified file"
                value={latest ? (latest.verifiedExists ? "Yes" : "No") : "—"}
              />
              <Row
                label="Verified size"
                value={latest?.verifiedSizeBytes ? `${latest.verifiedSizeBytes} bytes` : "—"}
              />
            </dl>
          </div>

          {canManage ? (
            <div className="mt-6 flex gap-3">
              <Button onClick={() => forceMutation.mutate()} disabled={forceMutation.isPending}>
                <Rocket className="h-4 w-4 mr-2" />
                {forceMutation.isPending ? "Starting..." : "Force redeploy"}
              </Button>
              <Button
                variant="outline"
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending || !latest}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {verifyMutation.isPending ? "Verifying..." : "Verify SYSVOL"}
              </Button>
            </div>
          ) : null}
          {latest?.message ? (
            <div className="mt-4 text-sm text-muted-foreground">
              Latest status: {latest.message}
            </div>
          ) : null}
          {isPending ? (
            <div className="mt-4 text-sm text-muted-foreground">Loading deployment data...</div>
          ) : null}
          {error ? (
            <div className="mt-4 text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load deployments."}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-bold mb-4">Deployment steps</h2>
          {steps.length > 0 ? (
            <ol className="space-y-4">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center gap-3">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center ${s.done ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.done ? "Completed" : "Pending or failed"}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              No deployment has been triggered yet.
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="flex-1 font-medium break-all">{value}</span>
    </div>
  );
}
