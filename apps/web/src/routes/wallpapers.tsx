import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Search, Download, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  apiDelete,
  apiGet,
  apiUpload,
  buildApiUrl,
  formatBytes,
  getStoredSession,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canManageWallpapers } from "@/lib/roles";
import { useProtectedImageUrls } from "@/lib/use-protected-image-urls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { WallpaperSummary } from "@cwcm/types";

export const Route = createFileRoute("/wallpapers")({
  head: () => ({
    meta: [
      { title: "Wallpaper Library — CWCM" },
      { name: "description", content: "Browse, upload, and manage corporate wallpaper assets." },
      { property: "og:title", content: "Wallpaper Library — CWCM" },
      {
        property: "og:description",
        content: "Browse, upload, and manage corporate wallpaper assets.",
      },
    ],
  }),
  component: Page,
});

function tagColor(t: string) {
  if (t === "In use") return "bg-success-soft text-success";
  if (t === "Scheduled") return "bg-info-soft text-info";
  return "bg-muted text-muted-foreground";
}

function Page() {
  const { isAuthenticated, session } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewItem, setPreviewItem] = useState<WallpaperSummary | null>(null);
  const [deleteItem, setDeleteItem] = useState<WallpaperSummary | null>(null);
  const [search, setSearch] = useState("");
  const [usageFilter, setUsageFilter] = useState<"ALL" | WallpaperSummary["usageStatus"]>("ALL");
  const { data, isPending, error } = useQuery({
    queryKey: ["wallpapers"],
    queryFn: () => apiGet<{ items: WallpaperSummary[] }>("/wallpapers"),
    enabled: isAuthenticated,
  });
  const canManage = canManageWallpapers(session?.user.role);
  const previewUrls = useProtectedImageUrls({
    items: data?.items,
    enabled: isAuthenticated,
    getId: (item) => item.id,
    getImageUrl: (item) => item.imageUrl,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return apiUpload<WallpaperSummary>("/wallpapers", formData);
    },
    onSuccess: (wallpaper) => {
      queryClient.invalidateQueries({ queryKey: ["wallpapers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(`Wallpaper "${wallpaper.title}" uploaded`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (wallpaperId: string) => apiDelete(`/wallpapers/${wallpaperId}`),
    onSuccess: () => {
      setDeleteItem(null);
      queryClient.invalidateQueries({ queryKey: ["wallpapers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Wallpaper deleted");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    },
  });

  const rows = useMemo(() => {
    const liveRows = data?.items ?? [];
    return liveRows.filter((item) => {
      const matchesSearch =
        !search ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.filename.toLowerCase().includes(search.toLowerCase());
      const matchesUsage = usageFilter === "ALL" || item.usageStatus === usageFilter;
      return matchesSearch && matchesUsage;
    });
  }, [data?.items, search, usageFilter]);

  async function handleDownload(item: WallpaperSummary) {
    try {
      const session = getStoredSession();
      const response = await fetch(buildApiUrl(item.imageUrl), {
        headers: session?.token ? { Authorization: `Bearer ${session.token}` } : undefined,
      });

      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = item.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success(`Downloading "${item.filename}"`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed");
    }
  }

  if (!canManage) {
    return (
      <AppLayout
        title="Wallpaper Library"
        subtitle="Manage all wallpaper assets available for campaigns"
      >
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-sm text-muted-foreground">
          Your role does not have access to the wallpaper library.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Wallpaper Library"
      subtitle="Manage all wallpaper assets available for campaigns"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search wallpapers..."
            className="pl-9 bg-card"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Button
          variant="outline"
          onClick={() =>
            setUsageFilter((current) =>
              current === "ALL"
                ? "IN_USE"
                : current === "IN_USE"
                  ? "SCHEDULED"
                  : current === "SCHEDULED"
                    ? "DRAFT"
                    : "ALL",
            )
          }
        >
          Filter:{" "}
          {usageFilter === "ALL"
            ? "All"
            : usageFilter === "IN_USE"
              ? "In use"
              : usageFilter === "SCHEDULED"
                ? "Scheduled"
                : "Draft"}
        </Button>
        <div className="flex-1" />
        {canManage ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadMutation.mutate(file);
                event.target.value = "";
              }}
            />
            <Button onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Wallpaper
            </Button>
          </>
        ) : null}
      </div>

      {isPending ? (
        <div className="text-sm text-muted-foreground">Loading wallpapers...</div>
      ) : error ? (
        <div className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load wallpapers."}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-sm text-muted-foreground">
          {search || usageFilter !== "ALL"
            ? "No wallpapers match the current search or filter."
            : "No wallpapers uploaded yet."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {rows.map((it) => (
            <div
              key={it.id}
              className="rounded-xl border border-border bg-card overflow-hidden group"
            >
              <div className="relative aspect-video overflow-hidden bg-muted">
                {previewUrls[it.id] ? (
                  <img
                    src={previewUrls[it.id]}
                    alt={it.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
                    Loading preview...
                  </div>
                )}
                <Badge
                  className={`absolute top-2 left-2 ${tagColor(it.usageStatus === "IN_USE" ? "In use" : it.usageStatus === "SCHEDULED" ? "Scheduled" : "Draft")} hover:${tagColor(it.usageStatus === "IN_USE" ? "In use" : it.usageStatus === "SCHEDULED" ? "Scheduled" : "Draft")}`}
                >
                  {it.usageStatus === "IN_USE"
                    ? "In use"
                    : it.usageStatus === "SCHEDULED"
                      ? "Scheduled"
                      : "Draft"}
                </Badge>
                {it.isDefault ? (
                  <Badge className="absolute top-2 right-2 bg-primary/10 text-primary hover:bg-primary/10">
                    Default
                  </Badge>
                ) : null}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{it.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{it.filename}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
                  <span>{`${it.width}×${it.height}`}</span>
                  <span>•</span>
                  <span>{formatBytes(it.sizeBytes)}</span>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setPreviewItem(it);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void handleDownload(it);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {canManage ? (
                    <Button size="sm" variant="outline" onClick={() => setDeleteItem(it)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(previewItem)} onOpenChange={(open) => !open && setPreviewItem(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewItem?.title ?? "Wallpaper preview"}</DialogTitle>
            <DialogDescription>
              {previewItem
                ? `${previewItem.width}×${previewItem.height} • ${formatBytes(previewItem.sizeBytes)}`
                : "Preview wallpaper image"}
            </DialogDescription>
          </DialogHeader>
          {previewItem ? (
            <img
              src={previewUrls[previewItem.id] ?? previewItem.imageUrl}
              alt={previewItem.title}
              className="w-full rounded-md border border-border bg-muted object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteItem) && canManage}
        onOpenChange={(open) => !open && setDeleteItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete wallpaper?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteItem
                ? `Delete "${deleteItem.title}" from the wallpaper library. This action cannot be undone.`
                : "Delete selected wallpaper."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (deleteItem) {
                  deleteMutation.mutate(deleteItem.id);
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
