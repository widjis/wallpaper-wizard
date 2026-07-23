import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Calendar } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — CWCM" },
      { name: "description", content: "Create, edit, and schedule wallpaper campaigns across the organization." },
      { property: "og:title", content: "Campaigns — CWCM" },
      { property: "og:description", content: "Create, edit, and schedule wallpaper campaigns across the organization." },
    ],
  }),
  component: Page,
});

const rows = [
  { name: "Safety Awareness 2026", wallpaper: "Safety_Awareness_2026.jpg", start: "23 Jul 2026", end: "31 Jul 2026", priority: "High", status: "Active" },
  { name: "Independence Day", wallpaper: "Independence_Day_2026.jpg", start: "1 Aug 2026", end: "17 Aug 2026", priority: "Normal", status: "Scheduled" },
  { name: "Company Anniversary", wallpaper: "Anniversary_25.jpg", start: "1 Sep 2026", end: "7 Sep 2026", priority: "High", status: "Scheduled" },
  { name: "Christmas 2026", wallpaper: "Christmas_2026.jpg", start: "20 Dec 2026", end: "31 Dec 2026", priority: "Normal", status: "Scheduled" },
  { name: "Safety Week Q2", wallpaper: "Safety_Q2.jpg", start: "1 Apr 2026", end: "7 Apr 2026", priority: "High", status: "Completed" },
  { name: "New Year 2026", wallpaper: "NewYear_2026.jpg", start: "1 Jan 2026", end: "3 Jan 2026", priority: "Normal", status: "Completed" },
  { name: "Q3 Cybersecurity", wallpaper: "Cyber_Q3.jpg", start: "—", end: "—", priority: "Normal", status: "Draft" },
];

function statusColor(s: string) {
  if (s === "Active") return "bg-success-soft text-success";
  if (s === "Scheduled") return "bg-info-soft text-info";
  if (s === "Completed") return "bg-muted text-muted-foreground";
  if (s === "Draft") return "bg-warning-soft text-warning-foreground";
  return "bg-muted text-muted-foreground";
}

function Page() {
  return (
    <AppLayout title="Campaigns" subtitle="Plan and manage every wallpaper campaign">
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search campaigns..." className="pl-9 bg-card" />
        </div>
        <Button variant="outline">Status</Button>
        <Button variant="outline">Priority</Button>
        <div className="flex-1" />
        <Button><Plus className="h-4 w-4 mr-2" />New Campaign</Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Wallpaper</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.wallpaper}</TableCell>
                <TableCell className="text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Calendar className="h-3 w-3" />{r.start}</span></TableCell>
                <TableCell className="text-muted-foreground">{r.end}</TableCell>
                <TableCell>{r.priority}</TableCell>
                <TableCell><Badge className={`${statusColor(r.status)} hover:${statusColor(r.status)}`}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost">Edit</Button>
                  <Button size="sm" variant="ghost">Duplicate</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
}