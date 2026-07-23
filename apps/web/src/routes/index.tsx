import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Flag,
  Calendar,
  Activity,
  CheckCircle2,
  FolderClosed,
  Image as ImageIcon,
  Clock,
  PlayCircle,
  ChevronRight,
  GripVertical,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGet, formatDateTime } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useProtectedImageUrls } from "@/lib/use-protected-image-urls";
import type { CampaignSummary, DashboardSummary } from "@cwcm/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — CWCM" },
      {
        name: "description",
        content:
          "Overview of wallpaper campaign system, deployment status, and upcoming campaigns.",
      },
      { property: "og:title", content: "Dashboard — CWCM" },
      {
        property: "og:description",
        content:
          "Overview of wallpaper campaign system, deployment status, and upcoming campaigns.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const {
    data,
    isPending: isSummaryPending,
    error: summaryError,
  } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => apiGet<DashboardSummary>("/dashboard/summary"),
    enabled: isAuthenticated,
  });
  const campaignsQuery = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => apiGet<{ items: CampaignSummary[] }>("/campaigns"),
    enabled: isAuthenticated,
  });

  const currentCampaign = data?.currentCampaign;
  const nextCampaign = data?.nextCampaign;
  const deploymentStats = data?.deploymentStats;
  const schedulerStatus = data?.schedulerStatus;
  const recentActivity = data?.recentActivity ?? [];
  const upcomingCampaigns =
    campaignsQuery.data?.items.filter((campaign) => campaign.status === "SCHEDULED").slice(0, 3) ??
    [];
  const campaignImageUrls = useProtectedImageUrls({
    items: [
      ...(currentCampaign ? [currentCampaign] : []),
      ...(nextCampaign ? [nextCampaign] : []),
      ...upcomingCampaigns,
    ],
    enabled: isAuthenticated,
    getId: (campaign) => campaign.id,
    getImageUrl: (campaign) => campaign.wallpaperImageUrl,
  });
  const systemInfoRows = data
    ? [
        { icon: FolderClosed, label: "SYSVOL Path", value: data.systemInfo.sysvolPath || "—" },
        {
          icon: ImageIcon,
          label: "Wallpaper Filename",
          value: data.systemInfo.wallpaperFilename || "—",
        },
        {
          icon: ImageIcon,
          label: "Default Wallpaper",
          value: data.systemInfo.defaultWallpaperTitle || "Not configured",
        },
        {
          icon: Clock,
          label: "Scheduler Interval",
          value: `${schedulerStatus?.intervalMinutes ?? 1} minute`,
        },
        {
          icon: PlayCircle,
          label: "Last Scheduler Run",
          value: formatDateTime(schedulerStatus?.lastRunAt),
        },
        {
          icon: PlayCircle,
          label: "Next Schedule Run",
          value: formatDateTime(schedulerStatus?.nextRunAt),
        },
        { icon: Clock, label: "Server Time", value: formatDateTime(data.systemInfo.serverTime) },
      ]
    : [];
  const donutStats = deploymentStats ?? { success: 0, failed: 0, warning: 0, total: 0 };
  const loadError =
    summaryError instanceof Error
      ? summaryError.message
      : campaignsQuery.error instanceof Error
        ? campaignsQuery.error.message
        : null;
  const isLoading = isSummaryPending || campaignsQuery.isPending;

  return (
    <AppLayout title="Dashboard" subtitle="Overview of wallpaper campaign system">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <StatCard
            label="Current Campaign"
            value={currentCampaign?.name ?? "No active campaign"}
            icon={Flag}
            tone="success"
            badge={
              <Badge className="bg-success-soft text-success hover:bg-success-soft">
                {currentCampaign?.status ?? "Draft"}
              </Badge>
            }
            footer={
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                {currentCampaign
                  ? `${formatDateTime(currentCampaign.startDate)} - ${formatDateTime(currentCampaign.endDate)}`
                  : "Not scheduled"}
              </span>
            }
          />
          <StatCard
            label="Next Campaign"
            value={nextCampaign?.name ?? "No scheduled campaign"}
            icon={Calendar}
            tone="info"
            badge={
              <Badge className="bg-info-soft text-info hover:bg-info-soft">
                {nextCampaign?.status ?? "Pending"}
              </Badge>
            }
            footer={
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                {nextCampaign ? `Starts ${formatDateTime(nextCampaign.startDate)}` : "No queue"}
              </span>
            }
          />
          <StatCard
            label="Scheduler Status"
            value={schedulerStatus?.healthy ? "Healthy" : "Needs attention"}
            icon={Activity}
            tone="success"
            badge={
              <Badge className="bg-success-soft text-success hover:bg-success-soft">
                {schedulerStatus?.queueState ?? "Unknown"}
              </Badge>
            }
            footer={`Interval: ${schedulerStatus?.intervalMinutes ?? 1} minute`}
          />
          <StatCard
            label="Last Deployment"
            value={deploymentStats ? `${deploymentStats.success}/${deploymentStats.total}` : "0/0"}
            icon={CheckCircle2}
            tone="success"
            footer={
              <>
                {deploymentStats
                  ? `${deploymentStats.success} success, ${deploymentStats.failed} failed, ${deploymentStats.warning} warning`
                  : "No deployment summary"}
                <br />
                <a className="text-primary hover:underline" href="/history">
                  View details
                </a>
              </>
            }
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold">Current Campaign</h2>
              <Button size="sm" onClick={() => navigate({ to: "/campaigns" })}>
                View Campaign
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {currentCampaign ? (
                campaignImageUrls[currentCampaign.id] ? (
                  <img
                    src={campaignImageUrls[currentCampaign.id]}
                    alt={currentCampaign.wallpaperTitle}
                    className="w-full h-56 object-cover rounded-lg"
                  />
                ) : (
                  <EmptyPanel label="Loading wallpaper preview..." />
                )
              ) : (
                <EmptyPanel label="No active campaign wallpaper to preview." />
              )}
              <div>
                <h3 className="text-lg font-bold">
                  {currentCampaign?.name ?? "No active campaign"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {currentCampaign?.description ?? "No campaign is active right now."}
                </p>
                <dl className="mt-4 space-y-2.5 text-sm">
                  <Row
                    icon={Calendar}
                    label="Started"
                    value={formatDateTime(currentCampaign?.startDate)}
                  />
                  <Row
                    icon={Calendar}
                    label="Ends"
                    value={formatDateTime(currentCampaign?.endDate)}
                  />
                  <Row
                    icon={Clock}
                    label="Priority"
                    value={currentCampaign ? `P${currentCampaign.priority}` : "—"}
                  />
                  <Row
                    icon={Activity}
                    label="Status"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-success" />
                        {currentCampaign?.status ?? "None"}
                      </span>
                    }
                  />
                  <Row
                    icon={ImageIcon}
                    label="Wallpaper"
                    value={currentCampaign?.wallpaperTitle ?? "—"}
                  />
                </dl>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">Upcoming Campaign</h2>
              <Link to="/timeline" className="text-sm text-primary hover:underline">
                View all
              </Link>
            </div>
            {upcomingCampaigns.length > 0 ? (
              <div className="space-y-3">
                {upcomingCampaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="flex items-center gap-3 pb-3 border-b border-border last:border-0 last:pb-0"
                  >
                    {campaignImageUrls[campaign.id] ? (
                      <img
                        src={campaignImageUrls[campaign.id]}
                        alt={campaign.wallpaperTitle}
                        className="h-12 w-16 object-cover rounded-md"
                      />
                    ) : (
                      <div className="h-12 w-16 rounded-md bg-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{campaign.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Starts on {formatDateTime(campaign.startDate)}
                      </div>
                    </div>
                    <Badge className="bg-info-soft text-info hover:bg-info-soft whitespace-nowrap">
                      {campaign.priority >= 8 ? "High" : "Scheduled"}
                    </Badge>
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyMessage message="No scheduled campaigns in the queue." />
            )}
            <Link
              to="/timeline"
              className="mt-4 flex items-center justify-between text-sm text-primary hover:underline"
            >
              View full timeline & queue
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-base font-bold mb-5">Deployment Status</h2>
            <div className="flex items-center gap-6">
              <DonutChart
                success={donutStats.success}
                failed={donutStats.failed}
                warning={donutStats.warning}
              />
              <div className="flex-1 space-y-2.5 text-sm">
                <LegendRow color="bg-success" label="Success" value={donutStats.success} />
                <LegendRow color="bg-destructive" label="Failed" value={donutStats.failed} />
                <LegendRow color="bg-warning" label="Warning" value={donutStats.warning} />
                <div className="pt-2 border-t border-border flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{donutStats.total}</span>
                </div>
              </div>
            </div>
            <Link
              to="/history"
              className="mt-5 flex items-center justify-between text-sm text-primary hover:underline"
            >
              View deployment history
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">Recent Activity</h2>
              <Link to="/history" className="text-sm text-primary hover:underline">
                View all
              </Link>
            </div>
            {recentActivity.length > 0 ? (
              <ul className="space-y-3">
                {recentActivity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{a.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{a.detail}</div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <div>{formatDateTime(a.timestamp)}</div>
                      <div>{a.actor}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyMessage message="No recent activity recorded yet." />
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-base font-bold mb-4">System Information</h2>
            {systemInfoRows.length > 0 ? (
              <ul className="space-y-3 text-sm">
                {systemInfoRows.map((s) => (
                  <li key={s.label} className="flex items-center gap-3">
                    <s.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground w-40 shrink-0">{s.label}</span>
                    <span className="flex-1 text-right font-medium truncate">{s.value}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyMessage message="System information is unavailable right now." />
            )}
          </div>
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading dashboard data...</div>
        ) : null}
        {loadError ? <div className="text-sm text-destructive">{loadError}</div> : null}
      </div>
    </AppLayout>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="w-full h-56 rounded-lg border border-dashed border-border bg-muted flex items-center justify-center text-sm text-muted-foreground text-center px-6">
      {label}
    </div>
  );
}

function EmptyMessage({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="flex-1 font-medium">{value}</span>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function DonutChart({
  success,
  failed,
  warning,
}: {
  success: number;
  failed: number;
  warning: number;
}) {
  const total = success + failed + warning;
  if (total === 0) {
    return (
      <div className="relative h-32 w-32 shrink-0 rounded-full border border-dashed border-border bg-muted flex items-center justify-center text-center">
        <div>
          <div className="text-lg font-semibold">0</div>
          <div className="text-[10px] text-muted-foreground">No deployments</div>
        </div>
      </div>
    );
  }
  const r = 42;
  const c = 2 * Math.PI * r;
  const seg = (n: number) => (n / total) * c;
  const sSeg = seg(success);
  const fSeg = seg(failed);
  const wSeg = seg(warning);
  const rate = Math.round((success / total) * 100);
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-muted)" strokeWidth="14" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-success)"
          strokeWidth="14"
          strokeDasharray={`${sSeg} ${c - sSeg}`}
          strokeDashoffset="0"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-destructive)"
          strokeWidth="14"
          strokeDasharray={`${fSeg} ${c - fSeg}`}
          strokeDashoffset={-sSeg}
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--color-warning)"
          strokeWidth="14"
          strokeDasharray={`${wSeg} ${c - wSeg}`}
          strokeDashoffset={-(sSeg + fSeg)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold text-success">{rate}%</div>
        <div className="text-[10px] text-muted-foreground">Success Rate</div>
      </div>
    </div>
  );
}
