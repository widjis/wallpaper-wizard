import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Calendar } from "lucide-react";
import { toast } from "sonner";
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
import { apiDelete, apiGet, apiPatch, apiPost, formatDateTime } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canManageCampaigns } from "@/lib/roles";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

function statusColor(s: string) {
  if (s === "Active") return "bg-success-soft text-success";
  if (s === "Scheduled") return "bg-info-soft text-info";
  if (s === "Completed") return "bg-muted text-muted-foreground";
  if (s === "Draft") return "bg-warning-soft text-warning-foreground";
  return "bg-muted text-muted-foreground";
}

const fallbackTimeZones = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Singapore",
  "UTC",
  "Europe/London",
  "America/New_York",
];

function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function padTimePart(value: number) {
  return String(value).padStart(2, "0");
}

function getTimeZoneDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour === "24" ? "00" : values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function toDateTimeLocalValue(value: string | null | undefined, timeZone: string) {
  if (!value) return "";
  const parts = getTimeZoneDateParts(new Date(value), timeZone);
  return `${parts.year}-${padTimePart(parts.month)}-${padTimePart(parts.day)}T${padTimePart(parts.hour)}:${padTimePart(parts.minute)}`;
}

function toUtcIsoString(value: string, timeZone: string) {
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) {
    return null;
  }

  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);

  const guessParts = getTimeZoneDateParts(new Date(utcGuess), timeZone);
  const guessAsUtc = Date.UTC(
    guessParts.year,
    guessParts.month - 1,
    guessParts.day,
    guessParts.hour,
    guessParts.minute,
    guessParts.second,
  );
  const firstPass = utcGuess - (guessAsUtc - utcGuess);
  const firstPassParts = getTimeZoneDateParts(new Date(firstPass), timeZone);
  const firstPassAsUtc = Date.UTC(
    firstPassParts.year,
    firstPassParts.month - 1,
    firstPassParts.day,
    firstPassParts.hour,
    firstPassParts.minute,
    firstPassParts.second,
  );

  return new Date(firstPass - (firstPassAsUtc - utcGuess)).toISOString();
}

function buildTimeZoneOptions(preferredTimeZone: string) {
  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : fallbackTimeZones;

  return [...new Set([preferredTimeZone, ...fallbackTimeZones, ...supported])];
}

function Page() {
  const queryClient = useQueryClient();
  const { isAuthenticated, session } = useAuth();
  const browserTimeZone = useMemo(() => getBrowserTimeZone(), []);
  const timeZoneOptions = useMemo(() => buildTimeZoneOptions(browserTimeZone), [browserTimeZone]);
  const [showForm, setShowForm] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | CampaignSummary["status"]>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "HIGH" | "NORMAL">("ALL");
  const [deleteTarget, setDeleteTarget] = useState<CampaignSummary | null>(null);
  const [form, setForm] = useState({
    name: "",
    wallpaperId: "",
    description: "",
    startDate: "",
    endDate: "",
    timeZone: browserTimeZone,
    priority: "5",
  });

  const {
    data,
    isPending: isCampaignsPending,
    error: campaignsError,
  } = useQuery({
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
        startDate: form.startDate ? toUtcIsoString(form.startDate, form.timeZone) : null,
        endDate: form.endDate ? toUtcIsoString(form.endDate, form.timeZone) : null,
        timeZone: form.timeZone,
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
        timeZone: browserTimeZone,
        priority: "5",
      });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success("Campaign created successfully");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create campaign");
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingCampaignId) {
        throw new Error("Campaign ID is required");
      }
      return apiPatch<CampaignSummary>(`/campaigns/${editingCampaignId}`, {
        name: form.name,
        wallpaperId: form.wallpaperId,
        description: form.description || null,
        startDate: form.startDate ? toUtcIsoString(form.startDate, form.timeZone) : null,
        endDate: form.endDate ? toUtcIsoString(form.endDate, form.timeZone) : null,
        timeZone: form.timeZone,
        priority: Number(form.priority),
      });
    },
    onSuccess: () => {
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success("Campaign updated successfully");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to update campaign");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (campaignId: string) => apiDelete(`/campaigns/${campaignId}`),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success("Campaign deleted successfully");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete campaign");
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (campaignId: string) =>
      apiPost<CampaignSummary>(`/campaigns/${campaignId}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success("Campaign duplicated successfully");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to duplicate campaign");
    },
  });

  const activateMutation = useMutation({
    mutationFn: (campaignId: string) =>
      apiPost<CampaignSummary>(`/campaigns/${campaignId}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success("Campaign activated");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to activate campaign");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (campaignId: string) => apiPost<CampaignSummary>(`/campaigns/${campaignId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      toast.success("Campaign cancelled");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to cancel campaign");
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditingCampaignId(null);
    setForm({
      name: "",
      wallpaperId: "",
      description: "",
      startDate: "",
      endDate: "",
      timeZone: browserTimeZone,
      priority: "5",
    });
  }

  const campaignRows = useMemo(() => {
    const source = data?.items ?? [];
    return source.filter((item) => {
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.wallpaperTitle.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
      const matchesPriority =
        priorityFilter === "ALL" ||
        (priorityFilter === "HIGH" ? item.priority >= 8 : item.priority < 8);
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [data?.items, priorityFilter, search, statusFilter]);

  const wallpaperOptions = wallpaperQuery.data?.items ?? [];
  const hasWallpapers = wallpaperOptions.length > 0;
  const canManage = canManageCampaigns(session?.user.role);
  const canSubmit =
    form.name.trim().length > 0 &&
    form.wallpaperId.trim().length > 0 &&
    !createMutation.isPending &&
    !updateMutation.isPending;

  return (
    <AppLayout title="Campaigns" subtitle="Plan and manage every wallpaper campaign">
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            className="pl-9 bg-card"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          onClick={() =>
            setStatusFilter((current) =>
              current === "ALL"
                ? "ACTIVE"
                : current === "ACTIVE"
                  ? "SCHEDULED"
                  : current === "SCHEDULED"
                    ? "DRAFT"
                    : current === "DRAFT"
                      ? "COMPLETED"
                      : current === "COMPLETED"
                        ? "CANCELLED"
                        : "ALL",
            )
          }
        >
          Status: {statusFilter}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            setPriorityFilter((current) =>
              current === "ALL" ? "HIGH" : current === "HIGH" ? "NORMAL" : "ALL",
            )
          }
        >
          Priority: {priorityFilter}
        </Button>
        <div className="flex-1" />
        {canManage ? (
          <Button
            onClick={() => {
              if (showForm && !editingCampaignId) {
                resetForm();
                return;
              }
              setShowForm(true);
              setEditingCampaignId(null);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Campaign
          </Button>
        ) : null}
      </div>

      {showForm && canManage ? (
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
                <option value="">
                  {wallpaperQuery.isPending
                    ? "Loading wallpapers..."
                    : hasWallpapers
                      ? "Select wallpaper"
                      : "No wallpapers available"}
                </option>
                {wallpaperOptions.map((item) => (
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
            <Field label="Time zone">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.timeZone}
                onChange={(event) => setForm({ ...form, timeZone: event.target.value })}
              >
                {timeZoneOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
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
            <Button
              onClick={() => {
                if (editingCampaignId) {
                  updateMutation.mutate();
                  return;
                }

                createMutation.mutate();
              }}
              disabled={!canSubmit}
            >
              {editingCampaignId
                ? updateMutation.isPending
                  ? "Updating..."
                  : "Update campaign"
                : createMutation.isPending
                  ? "Saving..."
                  : "Save campaign"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
              }}
            >
              Cancel
            </Button>
          </div>
          {wallpaperQuery.error ? (
            <div className="mt-3 text-sm text-destructive">
              {wallpaperQuery.error instanceof Error
                ? wallpaperQuery.error.message
                : "Failed to load wallpapers."}
            </div>
          ) : null}
          {!wallpaperQuery.isPending && !hasWallpapers ? (
            <div className="mt-3 text-sm text-muted-foreground">
              Upload at least one wallpaper before creating a campaign.
            </div>
          ) : null}
          <div className="mt-3 text-sm text-muted-foreground">
            {editingCampaignId
              ? "Edit the selected campaign, including its effective timezone, and save your changes."
              : "Create a campaign draft or a scheduled campaign with an explicit timezone."}
          </div>
          {editingCampaignId ? (
            <div className="mt-3 text-sm text-success">Editing mode is active.</div>
          ) : null}
        </div>
      ) : null}
      {!canManage ? (
        <div className="mb-6 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Your role can review campaign data but cannot create or change campaigns.
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
            {isCampaignsPending ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Loading campaigns...
                </TableCell>
              </TableRow>
            ) : campaignsError ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-destructive">
                  {campaignsError instanceof Error
                    ? campaignsError.message
                    : "Failed to load campaigns."}
                </TableCell>
              </TableRow>
            ) : campaignRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {search || statusFilter !== "ALL" || priorityFilter !== "ALL"
                    ? "No campaigns match the current search or filters."
                    : "No campaigns found yet. Create your first campaign from the button above."}
                </TableCell>
              </TableRow>
            ) : (
              campaignRows.map((item) => {
                const name = item.name;
                const wallpaper = item.wallpaperTitle;
                const effectiveTimeZone = item.timeZone ?? browserTimeZone;
                const start = formatDateTime(item.startDate, effectiveTimeZone);
                const end = formatDateTime(item.endDate, effectiveTimeZone);
                const priority = item.priority >= 8 ? "High" : "Normal";
                const status = item.status.charAt(0) + item.status.slice(1).toLowerCase();
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="text-muted-foreground">{wallpaper}</TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        {start}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{end}</TableCell>
                    <TableCell>{priority}</TableCell>
                    <TableCell>
                      <Badge className={`${statusColor(status)} hover:${statusColor(status)}`}>
                        {status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (!item) return;
                            setEditingCampaignId(item.id);
                            setShowForm(true);
                            setForm({
                              name: item.name,
                              wallpaperId: item.wallpaperId,
                              description: item.description ?? "",
                              startDate: toDateTimeLocalValue(item.startDate, effectiveTimeZone),
                              endDate: toDateTimeLocalValue(item.endDate, effectiveTimeZone),
                              timeZone: effectiveTimeZone,
                              priority: String(item.priority),
                            });
                          }}
                          disabled={!canManage}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            duplicateMutation.mutate(item.id);
                          }}
                          disabled={!canManage}
                        >
                          Duplicate
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            activateMutation.mutate(item.id);
                          }}
                          disabled={!canManage}
                        >
                          Activate
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            cancelMutation.mutate(item.id);
                          }}
                          disabled={!canManage}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeleteTarget(item);
                          }}
                          disabled={!canManage}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Delete "${deleteTarget.name}" from the campaign plan. Active campaigns cannot be deleted.`
                : "Delete selected campaign."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
