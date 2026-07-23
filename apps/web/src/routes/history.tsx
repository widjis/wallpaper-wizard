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
import type { DeploymentLogItem } from "@cwcm/types";

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

const logs = [
  {
    time: "23 Jul 2026 08:00:15",
    campaign: "Safety Awareness 2026",
    user: "scheduler",
    duration: "15s",
    result: "Success",
  },
  {
    time: "22 Jul 2026 08:00:12",
    campaign: "Safety Awareness 2026",
    user: "scheduler",
    duration: "12s",
    result: "Success",
  },
  {
    time: "21 Jul 2026 08:00:22",
    campaign: "Safety Awareness 2026",
    user: "scheduler",
    duration: "22s",
    result: "Warning",
  },
  {
    time: "20 Jul 2026 08:00:14",
    campaign: "Safety Awareness 2026",
    user: "scheduler",
    duration: "14s",
    result: "Success",
  },
  {
    time: "17 Jul 2026 08:00:44",
    campaign: "Q3 Cybersecurity",
    user: "widji",
    duration: "44s",
    result: "Failed",
  },
  {
    time: "16 Jul 2026 08:00:11",
    campaign: "Mid-Year Review",
    user: "scheduler",
    duration: "11s",
    result: "Success",
  },
];

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
  const { data } = useQuery({
    queryKey: ["history"],
    queryFn: () => apiGet<{ items: DeploymentLogItem[] }>("/deployments"),
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
      })) ?? logs.map((item, index) => ({ ...item, id: `sample-${index}`, startedAtRaw: null })),
    [data?.items],
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
      ["Time", "Campaign", "Operator", "Duration", "Result"].join(","),
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
              <TableHead>Campaign</TableHead>
              <TableHead>Operator</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((l) => (
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
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
}
