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
import { apiDelete, apiGet, apiPatch, apiPost, formatDate } from "@/lib/api";
import { useAuth } from "@/lib/auth";
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

function Page() {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
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
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
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
  const canSubmit =
    form.name.trim().length > 0 &&
    form.wallpaperId.trim().length > 0 &&
    !createMutation.isPending &&
    !updateMutation.isPending;

  // #region debug-point A:campaigns-state
  useEffect(() => {
    fetch("http://127.0.0.1:7777/event", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "campaigns-still-broken",
        runId: "pre-fix",
        hypothesisId: "A",
        location: "campaigns.tsx:campaigns-state",
        msg: "[DEBUG] campaigns page state",
        data: {
          isAuthenticated,
          liveCount: data?.items?.length ?? 0,
          filteredCount: campaignRows.length,
          showForm,
          editingCampaignId,
          search,
          statusFilter,
          priorityFilter,
        },
        ts: Date.now(),
      }),
    }).catch(() => {});
  }, [
    campaignRows.length,
    data?.items?.length,
    editingCampaignId,
    isAuthenticated,
    priorityFilter,
    search,
    showForm,
    statusFilter,
  ]);
  // #endregion

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
            // #region debug-point A:status-filter-click
            fetch("http://127.0.0.1:7777/event", {
              method: "POST",
              body: JSON.stringify({
                sessionId: "campaigns-still-broken",
                runId: "pre-fix",
                hypothesisId: "A",
                location: "campaigns.tsx:status-filter-click",
                msg: "[DEBUG] status filter button clicked",
                data: {
                  current: statusFilter,
                },
                ts: Date.now(),
              }),
            }).catch(() => {})
              .finally(() =>
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
              )
          }
        >
          Status: {statusFilter}
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            // #region debug-point A:priority-filter-click
            fetch("http://127.0.0.1:7777/event", {
              method: "POST",
              body: JSON.stringify({
                sessionId: "campaigns-still-broken",
                runId: "pre-fix",
                hypothesisId: "A",
                location: "campaigns.tsx:priority-filter-click",
                msg: "[DEBUG] priority filter button clicked",
                data: {
                  current: priorityFilter,
                },
                ts: Date.now(),
              }),
            }).catch(() => {})
              .finally(() =>
            setPriorityFilter((current) =>
              current === "ALL" ? "HIGH" : current === "HIGH" ? "NORMAL" : "ALL",
            )
              )
          }
        >
          Priority: {priorityFilter}
        </Button>
        <div className="flex-1" />
        <Button
          onClick={() => {
            // #region debug-point A:new-campaign-click
            fetch("http://127.0.0.1:7777/event", {
              method: "POST",
              body: JSON.stringify({
                sessionId: "campaigns-still-broken",
                runId: "pre-fix",
                hypothesisId: "A",
                location: "campaigns.tsx:new-campaign-click",
                msg: "[DEBUG] new campaign button clicked",
                data: {
                  showForm,
                  editingCampaignId,
                },
                ts: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
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
                // #region debug-point B:save-click
                fetch("http://127.0.0.1:7777/event", {
                  method: "POST",
                  body: JSON.stringify({
                    sessionId: "campaigns-still-broken",
                    runId: "pre-fix",
                    hypothesisId: "B",
                    location: "campaigns.tsx:save-click",
                    msg: "[DEBUG] save campaign clicked",
                    data: {
                      editingCampaignId,
                      form,
                    },
                    ts: Date.now(),
                  }),
                }).catch(() => {});
                // #endregion
                editingCampaignId ? updateMutation.mutate() : createMutation.mutate();
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
              ? "Edit the selected campaign and save your changes."
              : "Create a new scheduled campaign."}
          </div>
          {editingCampaignId ? (
            <div className="mt-3 text-sm text-success">Editing mode is active.</div>
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
                const start = formatDate(item.startDate);
                const end = formatDate(item.endDate);
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
                          // #region debug-point C:edit-click
                          fetch("http://127.0.0.1:7777/event", {
                            method: "POST",
                            body: JSON.stringify({
                              sessionId: "campaigns-still-broken",
                              runId: "pre-fix",
                              hypothesisId: "C",
                              location: "campaigns.tsx:edit-click",
                              msg: "[DEBUG] edit campaign clicked",
                              data: {
                                campaignId: item?.id ?? null,
                                campaignName: item?.name ?? null,
                              },
                              ts: Date.now(),
                            }),
                          }).catch(() => {});
                          // #endregion
                          if (!item) return;
                          setEditingCampaignId(item.id);
                          setShowForm(true);
                          setForm({
                            name: item.name,
                            wallpaperId: item.wallpaperId,
                            description: item.description ?? "",
                            startDate: item.startDate ? item.startDate.slice(0, 16) : "",
                            endDate: item.endDate ? item.endDate.slice(0, 16) : "",
                            priority: String(item.priority),
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          fetch("http://127.0.0.1:7777/event", {
                            method: "POST",
                            body: JSON.stringify({
                              sessionId: "campaigns-still-broken",
                              runId: "pre-fix",
                              hypothesisId: "C",
                              location: "campaigns.tsx:duplicate-click",
                              msg: "[DEBUG] duplicate campaign clicked",
                              data: {
                                campaignId: item.id,
                              },
                              ts: Date.now(),
                            }),
                          }).catch(() => {});
                          duplicateMutation.mutate(item.id);
                        }}
                      >
                        Duplicate
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          fetch("http://127.0.0.1:7777/event", {
                            method: "POST",
                            body: JSON.stringify({
                              sessionId: "campaigns-still-broken",
                              runId: "pre-fix",
                              hypothesisId: "C",
                              location: "campaigns.tsx:activate-click",
                              msg: "[DEBUG] activate campaign clicked",
                              data: {
                                campaignId: item.id,
                              },
                              ts: Date.now(),
                            }),
                          }).catch(() => {});
                          activateMutation.mutate(item.id);
                        }}
                      >
                        Activate
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          fetch("http://127.0.0.1:7777/event", {
                            method: "POST",
                            body: JSON.stringify({
                              sessionId: "campaigns-still-broken",
                              runId: "pre-fix",
                              hypothesisId: "C",
                              location: "campaigns.tsx:cancel-click",
                              msg: "[DEBUG] cancel campaign clicked",
                              data: {
                                campaignId: item.id,
                              },
                              ts: Date.now(),
                            }),
                          }).catch(() => {});
                          cancelMutation.mutate(item.id);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          fetch("http://127.0.0.1:7777/event", {
                            method: "POST",
                            body: JSON.stringify({
                              sessionId: "campaigns-still-broken",
                              runId: "pre-fix",
                              hypothesisId: "C",
                              location: "campaigns.tsx:delete-click",
                              msg: "[DEBUG] delete campaign clicked",
                              data: {
                                campaignId: item.id,
                              },
                              ts: Date.now(),
                            }),
                          }).catch(() => {});
                          setDeleteTarget(item);
                        }}
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
