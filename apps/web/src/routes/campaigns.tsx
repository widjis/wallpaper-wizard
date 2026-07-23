import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Calendar } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost, formatDate } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { CampaignSummary, WallpaperSummary } from "@cwcm/types";

export const Route = createFileRoute("/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — CWCM" },
      {
        name: "description",
        content: "Create, edit, and schedule wallpaper campaigns across the organization.",
      },
      { property: "og:title", content: "Campaigns — CWCM" },
      {
        property: "og:description",
        content: "Create, edit, and schedule wallpaper campaigns across the organization.",
      },
    ],
  }),
  component: Page,
});

const rows = [
  {
    name: "Safety Awareness 2026",
    wallpaper: "Safety_Awareness_2026.jpg",
    start: "23 Jul 2026",
    end: "31 Jul 2026",
    priority: "High",
    status: "Active",
  },
  {
    name: "Independence Day",
    wallpaper: "Independence_Day_2026.jpg",
    start: "1 Aug 2026",
    end: "17 Aug 2026",
    priority: "Normal",
    status: "Scheduled",
  },
  {
    name: "Company Anniversary",
    wallpaper: "Anniversary_25.jpg",
    start: "1 Sep 2026",
    end: "7 Sep 2026",
    priority: "High",
    status: "Scheduled",
  },
  {
    name: "Christmas 2026",
    wallpaper: "Christmas_2026.jpg",
    start: "20 Dec 2026",
    end: "31 Dec 2026",
    priority: "Normal",
    status: "Scheduled",
  },
  {
    name: "Safety Week Q2",
    wallpaper: "Safety_Q2.jpg",
    start: "1 Apr 2026",
    end: "7 Apr 2026",
    priority: "High",
    status: "Completed",
  },
  {
    name: "New Year 2026",
    wallpaper: "NewYear_2026.jpg",
    start: "1 Jan 2026",
    end: "3 Jan 2026",
    priority: "Normal",
    status: "Completed",
  },
  {
    name: "Q3 Cybersecurity",
    wallpaper: "Cyber_Q3.jpg",
    start: "—",
    end: "—",
    priority: "Normal",
    status: "Draft",
  },
];

function statusColor(s: string) {
  if (s === "Active") return "bg-success-soft text-success";
  if (s === "Scheduled") return "bg-info-soft text-info";
  if (s === "Completed") return "bg-muted text-muted-foreground";
  if (s === "Draft") return "bg-warning-soft text-warning-foreground";
  return "bg-muted text-muted-foreground";
}

function Page() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    wallpaperId: "",
    description: "",
    startDate: "",
    endDate: "",
    priority: "5",
  });

  const { data } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => apiGet<{ items: CampaignSummary[] }>("/campaigns"),
    enabled: isAuthenticated,
  });

  const wallpaperQuery = useQuery({
    queryKey: ["wallpapers"],
    queryFn: () => apiGet<{ items: WallpaperSummary[] }>("/wallpapers"),
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost<CampaignSummary>("/campaigns", {
        name: form.name,
        wallpaperId: form.wallpaperId,
        description: form.description || null,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        priority: Number(form.priority),
      }),
    onSuccess: () => {
      setShowForm(false);
      setForm({
        name: "",
        wallpaperId: "",
        description: "",
        startDate: "",
        endDate: "",
        priority: "5",
      });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  const campaignRows =
    data?.items.map((campaign) => ({
      name: campaign.name,
      wallpaper: campaign.wallpaperTitle,
      start: formatDate(campaign.startDate),
      end: formatDate(campaign.endDate),
      priority: campaign.priority >= 8 ? "High" : "Normal",
      status: campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase(),
    })) ?? rows;

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
        <Button onClick={() => setShowForm((value) => !value)}>
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      {showForm ? (
        <div className="rounded-xl border border-border bg-card p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Campaign name">
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <Field label="Wallpaper">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.wallpaperId}
                onChange={(event) => setForm({ ...form, wallpaperId: event.target.value })}
              >
                <option value="">Select wallpaper</option>
                {(wallpaperQuery.data?.items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start date">
              <Input
                type="datetime-local"
                value={form.startDate}
                onChange={(event) => setForm({ ...form, startDate: event.target.value })}
              />
            </Field>
            <Field label="End date">
              <Input
                type="datetime-local"
                value={form.endDate}
                onChange={(event) => setForm({ ...form, endDate: event.target.value })}
              />
            </Field>
            <Field label="Priority">
              <Input
                value={form.priority}
                onChange={(event) => setForm({ ...form, priority: event.target.value })}
              />
            </Field>
            <Field label="Description">
              <Input
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
          </div>
          <div className="mt-4 flex gap-3">
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Save campaign"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
          {createMutation.error ? (
            <div className="mt-3 text-sm text-destructive">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Failed to create campaign"}
            </div>
          ) : null}
        </div>
      ) : null}

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
            {campaignRows.map((r) => (
              <TableRow key={r.name}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-muted-foreground">{r.wallpaper}</TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {r.start}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{r.end}</TableCell>
                <TableCell>{r.priority}</TableCell>
                <TableCell>
                  <Badge className={`${statusColor(r.status)} hover:${statusColor(r.status)}`}>
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost">
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost">
                    Duplicate
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
