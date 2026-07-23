import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History & Audit — CWCM" },
      { name: "description", content: "Deployment history and full audit trail of activity." },
      { property: "og:title", content: "History & Audit — CWCM" },
      { property: "og:description", content: "Deployment history and full audit trail of activity." },
    ],
  }),
  component: Page,
});

const logs = [
  { time: "23 Jul 2026 08:00:15", campaign: "Safety Awareness 2026", user: "scheduler", duration: "15s", result: "Success" },
  { time: "22 Jul 2026 08:00:12", campaign: "Safety Awareness 2026", user: "scheduler", duration: "12s", result: "Success" },
  { time: "21 Jul 2026 08:00:22", campaign: "Safety Awareness 2026", user: "scheduler", duration: "22s", result: "Warning" },
  { time: "20 Jul 2026 08:00:14", campaign: "Safety Awareness 2026", user: "scheduler", duration: "14s", result: "Success" },
  { time: "17 Jul 2026 08:00:44", campaign: "Q3 Cybersecurity", user: "widji", duration: "44s", result: "Failed" },
  { time: "16 Jul 2026 08:00:11", campaign: "Mid-Year Review", user: "scheduler", duration: "11s", result: "Success" },
];

function resultColor(r: string) {
  if (r === "Success") return "bg-success-soft text-success";
  if (r === "Warning") return "bg-warning-soft text-warning-foreground";
  if (r === "Failed") return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

function Page() {
  return (
    <AppLayout title="History & Audit" subtitle="Deployment log and activity trail">
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search logs..." className="pl-9 bg-card" />
        </div>
        <Button variant="outline">Result</Button>
        <Button variant="outline">Date range</Button>
        <div className="flex-1" />
        <Button variant="outline">Export CSV</Button>
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
            {logs.map((l, i) => (
              <TableRow key={i}>
                <TableCell className="text-muted-foreground">{l.time}</TableCell>
                <TableCell className="font-medium">{l.campaign}</TableCell>
                <TableCell className="text-muted-foreground">{l.user}</TableCell>
                <TableCell className="text-muted-foreground">{l.duration}</TableCell>
                <TableCell><Badge className={`${resultColor(l.result)} hover:${resultColor(l.result)}`}>{l.result}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
}