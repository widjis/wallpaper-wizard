import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Search, MoreVertical, Download, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  apiDelete,
  apiGet,
  apiImageUrl,
  apiUpload,
  formatBytes,
  getStoredSession,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
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
import safetyImg from "@/assets/wallpaper-safety.jpg";
import independenceImg from "@/assets/wallpaper-independence.jpg";
import anniversaryImg from "@/assets/wallpaper-anniversary.jpg";
import christmasImg from "@/assets/wallpaper-christmas.jpg";

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

const items = [
  {
    img: safetyImg,
    title: "Safety Awareness 2026",
    file: "Safety_Awareness_2026.jpg",
    res: "1920×1080",
    size: "2.4 MB",
    tag: "In use",
  },
  {
    img: independenceImg,
    title: "Independence Day",
    file: "Independence_Day_2026.jpg",
    res: "1920×1080",
    size: "1.8 MB",
    tag: "Scheduled",
  },
  {
    img: anniversaryImg,
    title: "Company Anniversary 25",
    file: "Anniversary_25.jpg",
    res: "1920×1080",
    size: "2.1 MB",
    tag: "Scheduled",
  },
  {
    img: christmasImg,
    title: "Christmas 2026",
    file: "Christmas_2026.jpg",
    res: "1920×1080",
    size: "3.2 MB",
    tag: "Scheduled",
  },
  {
    img: safetyImg,
    title: "Safety Week Q2",
    file: "Safety_Q2.jpg",
    res: "1920×1080",
    size: "2.2 MB",
    tag: "Draft",
  },
  {
    img: independenceImg,
    title: "National Heroes Day",
    file: "Heroes_Day.jpg",
    res: "1920×1080",
    size: "1.9 MB",
    tag: "Draft",
  },
];

function tagColor(t: string) {
  if (t === "In use") return "bg-success-soft text-success";
  if (t === "Scheduled") return "bg-info-soft text-info";
  return "bg-muted text-muted-foreground";
}

function Page() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [previewItem, setPreviewItem] = useState<WallpaperSummary | null>(null);
  const [deleteItem, setDeleteItem] = useState<WallpaperSummary | null>(null);
  const { data } = useQuery({
    queryKey: ["wallpapers"],
    queryFn: () => apiGet<{ items: WallpaperSummary[] }>("/wallpapers"),
    enabled: isAuthenticated,
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
      toast.success("Wallpaper deleted");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    },
  });

  const rows =
    data?.items ??
    items.map((item) => ({
      ...item,
      sizeBytes: Number.parseFloat(item.size) * 1024 * 1024,
      usageStatus:
        item.tag === "In use" ? "IN_USE" : item.tag === "Scheduled" ? "SCHEDULED" : "DRAFT",
    }));

  useEffect(() => {
    const liveWallpapers = data?.items;
    if (!liveWallpapers?.length) {
      return;
    }

    let revoked = false;
    const allocatedUrls: string[] = [];

    void Promise.all(
      liveWallpapers.map(async (item) => {
        const relativePath = item.imageUrl
          .replace(/^https?:\/\/[^/]+\/api/, "")
          .replace(/^\/api/, "");
        const objectUrl = await apiImageUrl(relativePath);
        allocatedUrls.push(objectUrl);
        return [item.id, objectUrl] as const;
      }),
    )
      .then((entries) => {
        if (revoked) {
          entries.forEach(([, url]) => URL.revokeObjectURL(url));
          return;
        }

        setPreviewUrls(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!revoked) {
          setPreviewUrls({});
        }
      });

    return () => {
      revoked = true;
      allocatedUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [data?.items]);

  async function handleDownload(item: WallpaperSummary) {
    try {
      const session = getStoredSession();
      const response = await fetch(`http://localhost:3000${item.imageUrl}`, {
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

  return (
    <AppLayout
      title="Wallpaper Library"
      subtitle="Manage all wallpaper assets available for campaigns"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search wallpapers..." className="pl-9 bg-card" />
        </div>
        <Button variant="outline">Filter</Button>
        <div className="flex-1" />
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {rows.map((it, i) => (
          <div key={i} className="rounded-xl border border-border bg-card overflow-hidden group">
            <div className="relative aspect-video overflow-hidden bg-muted">
              <img
                src={"img" in it ? it.img : (previewUrls[it.id] ?? it.imageUrl)}
                alt={it.title}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
              <Badge
                className={`absolute top-2 left-2 ${tagColor("usageStatus" in it ? (it.usageStatus === "IN_USE" ? "In use" : it.usageStatus === "SCHEDULED" ? "Scheduled" : "Draft") : it.tag)} hover:${tagColor("usageStatus" in it ? (it.usageStatus === "IN_USE" ? "In use" : it.usageStatus === "SCHEDULED" ? "Scheduled" : "Draft") : it.tag)}`}
              >
                {"usageStatus" in it
                  ? it.usageStatus === "IN_USE"
                    ? "In use"
                    : it.usageStatus === "SCHEDULED"
                      ? "Scheduled"
                      : "Draft"
                  : it.tag}
              </Badge>
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{it.title}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {"filename" in it ? it.filename : it.file}
                  </div>
                </div>
                <button className="text-muted-foreground hover:text-foreground">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
                <span>{"resolution" in it ? `${it.width}×${it.height}` : it.res}</span>
                <span>•</span>
                <span>{"sizeBytes" in it ? formatBytes(it.sizeBytes) : it.size}</span>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    if ("id" in it) {
                      setPreviewItem(it);
                      return;
                    }
                    toast.info("Preview is available for live wallpapers only");
                  }}
                >
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  Preview
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if ("id" in it) {
                      void handleDownload(it);
                      return;
                    }
                    toast.info("Download is available for live wallpapers only");
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if ("id" in it) {
                      setDeleteItem(it);
                      return;
                    }
                    toast.info("Delete is available for live wallpapers only");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

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

      <AlertDialog open={Boolean(deleteItem)} onOpenChange={(open) => !open && setDeleteItem(null)}>
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
