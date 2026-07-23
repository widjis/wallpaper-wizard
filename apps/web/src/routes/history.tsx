import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, downloadTextFile, formatDateTime } from "@/lib/api";
import type { ActivityLogItem, DeploymentLogItem } from "@cwcm/types";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History & Audit — CWCM" },
      { name: "description", content: "Deployment history and full audit trail of activity." },
      { property: "og:title", content: "History & Audit — CWCM" },
      {
        property: "og:description",
        content: "Deployment history and full audit trail of activity.",
      },
    ],
  }),
  component: Page,
});

function resultColor(r: string) {
  if (r === "Success") return "bg-success-soft text-success";
  if (r === "Warning") return "bg-warning-soft text-warning-foreground";
  if (r === "Failed") return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

function Page() {
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<"ALL" | "Success" | "Warning" | "Failed">("ALL");
  const [recentOnly, setRecentOnly] = useState(false);
  const {
    data,
    isPending: deploymentsPending,
    error: deploymentsError,
  } = useQuery({
    queryKey: ["history"],
    queryFn: () => apiGet<{ items: DeploymentLogItem[] }>("/deployments"),
  });
  const {
    data: activityData,
    isPending: activityPending,
    error: activityError,
  } = useQuery({
    queryKey: ["activity"],
    queryFn: () => apiGet<{ items: ActivityLogItem[] }>("/activity"),
  });

  const rows = useMemo(
    () =>
      data?.items.map((item) => ({
        id: item.id,
        startedAtRaw: item.startedAt,
        time: formatDateTime(item.startedAt),
        campaign: item.campaignName,
        user: item.operator,
        duration: item.durationSeconds ? `${item.durationSeconds}s` : "—",
        result: item.result.charAt(0) + item.result.slice(1).toLowerCase(),
      })) ?? [],
    [data?.items],
  );
  const activityRows = useMemo(
    () =>
      activityData?.items.filter((item) => {
        const keyword = search.toLowerCase();
        return (
          !keyword ||
          item.title.toLowerCase().includes(keyword) ||
          item.detail.toLowerCase().includes(keyword) ||
          item.actor.toLowerCase().includes(keyword)
        );
      }) ?? [],
    [activityData?.items, search],
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const matchesSearch =
          !search ||
          row.campaign.toLowerCase().includes(search.toLowerCase()) ||
          row.user.toLowerCase().includes(search.toLowerCase()) ||
          row.result.toLowerCase().includes(search.toLowerCase());
        const matchesResult = resultFilter === "ALL" || row.result === resultFilter;
        const matchesRecent =
          !recentOnly ||
          !row.startedAtRaw ||
          Date.now() - new Date(row.startedAtRaw).getTime() <= 7 * 24 * 60 * 60 * 1000;
        return matchesSearch && matchesResult && matchesRecent;
      }),
    [recentOnly, resultFilter, rows, search],
  );

  function exportCsv() {
    const lines = [
      ["Time", "Campaign or Source", "Operator", "Duration", "Result"].join(","),
      ...filteredRows.map((row) =>
        [row.time, row.campaign, row.user, row.duration, row.result]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ];
    downloadTextFile("cwcm-history.csv", lines.join("\n"), "text/csv;charset=utf-8");
    toast.success("History exported to CSV");
  }

  return (
    <AppLayout title="History & Audit" subtitle="Deployment log and activity trail">
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            className="pl-9 bg-card"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          onClick={() =>
            setResultFilter((current) =>
              current === "ALL"
                ? "Success"
                : current === "Success"
                  ? "Warning"
                  : current === "Warning"
                    ? "Failed"
                    : "ALL",
            )
          }
        >
          Result: {resultFilter}
        </Button>
        <Button variant="outline" onClick={() => setRecentOnly((current) => !current)}>
          Date range: {recentOnly ? "Last 7 days" : "All time"}
        </Button>
        <div className="flex-1" />
        <Button variant="outline" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Campaign / Source</TableHead>
              <TableHead>Operator</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deploymentsPending ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Loading deployment history...
                </TableCell>
              </TableRow>
            ) : deploymentsError ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-destructive">
                  {deploymentsError instanceof Error
                    ? deploymentsError.message
                    : "Failed to load deployment history."}
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {search || resultFilter !== "ALL" || recentOnly
                    ? "No deployment history matches the current filters."
                    : "No deployment history available yet."}
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-muted-foreground">{l.time}</TableCell>
                  <TableCell className="font-medium">{l.campaign}</TableCell>
                  <TableCell className="text-muted-foreground">{l.user}</TableCell>
                  <TableCell className="text-muted-foreground">{l.duration}</TableCell>
                  <TableCell>
                    <Badge className={`${resultColor(l.result)} hover:${resultColor(l.result)}`}>
                      {l.result}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-bold">Activity Audit</h2>
          <p className="text-sm text-muted-foreground">
            Login, upload, scheduling, deployment, and settings activity.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activityPending ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Loading activity audit...
                </TableCell>
              </TableRow>
            ) : activityError ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-destructive">
                  {activityError instanceof Error
                    ? activityError.message
                    : "Failed to load activity audit."}
                </TableCell>
              </TableRow>
            ) : activityRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  {search
                    ? "No activity entries match the current search."
                    : "No activity audit available yet."}
                </TableCell>
              </TableRow>
            ) : (
              activityRows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(item.timestamp)}
                  </TableCell>
                  <TableCell className="font-medium">{item.title}</TableCell>
                  <TableCell className="text-muted-foreground">{item.actor}</TableCell>
                  <TableCell className="text-muted-foreground">{item.detail}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
}
