import { createFileRoute, Link, useNavigate, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Search, MoreHorizontal, Plus, Star, X } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { WallpaperImage } from "@/components/wallpaper-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPut,
  apiUpload,
  apiUploadPreview,
  apiImageUrl,
  resolveApiPath,
  formatBytes,
  formatDateTime,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canManageWallpapers, isAdministrator } from "@/lib/roles";
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

const filters = {
  ALL: "All wallpapers",
  DEFAULT: "Default",
  ACTIVE: "Active campaign",
  SCHEDULED: "Scheduled",
  UNUSED: "Unused",
};
const sorts = { NEWEST: "Newest first", NAME: "Name A–Z", SIZE: "Largest first" };
export const Route = createFileRoute("/wallpapers")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
    filter:
      typeof search.filter === "string" && search.filter in filters
        ? (search.filter as keyof typeof filters)
        : ("ALL" as const),
    sort:
      typeof search.sort === "string" && search.sort in sorts
        ? (search.sort as keyof typeof sorts)
        : ("NEWEST" as const),
  }),
  head: () => ({ meta: [{ title: "Wallpaper Library — CWCM" }] }),
  component: Page,
});

function deletionReason(item: WallpaperSummary) {
  if (item.isDefault)
    return "This is the default wallpaper. Choose a different default before deleting it.";
  if (item.campaigns?.some((c) => ["DRAFT", "SCHEDULED", "ACTIVE"].includes(c.status)))
    return "This wallpaper is used by a draft, scheduled, or active campaign. Review its campaigns before deleting it.";
  return "";
}
function StatusBadges({ item }: { item: WallpaperSummary }) {
  const campaigns = item.campaigns ?? [];
  return (
    <div className="flex gap-2 flex-wrap">
      {item.isDefault && (
        <Badge>
          <Star className="w-3 h-3 mr-1" />
          Default
        </Badge>
      )}
      {campaigns.some((c) => c.status === "ACTIVE") && (
        <Badge variant="secondary">Active campaign</Badge>
      )}
      {campaigns.some((c) => c.status === "SCHEDULED") && (
        <Badge variant="secondary">Scheduled</Badge>
      )}
      {campaigns.some((c) => c.status === "DRAFT") && (
        <Badge variant="outline">Used in draft</Badge>
      )}
      {!campaigns.length && !item.isDefault && <Badge variant="outline">Unused</Badge>}
      {campaigns.length > 0 &&
        campaigns.every((c) => ["COMPLETED", "CANCELLED"].includes(c.status)) && (
          <Badge variant="outline">Past campaigns</Badge>
        )}
    </div>
  );
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Request failed. Please try again.";

function Page() {
  const { isAuthenticated, session } = useAuth();
  const canManage = canManageWallpapers(session?.user.role);
  const isAdmin = isAdministrator(session?.user.role);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { q, filter, sort } = Route.useSearch();
  const searchRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<WallpaperSummary | null>(null);
  const [defaultItem, setDefaultItem] = useState<WallpaperSummary | null>(null);
  const [deleteItem, setDeleteItem] = useState<WallpaperSummary | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [fileError, setFileError] = useState("");
  const [discard, setDiscard] = useState<"upload" | "edit" | null>(null);
  const list = useQuery({
    queryKey: ["wallpapers"],
    queryFn: () => apiGet<{ items: WallpaperSummary[] }>("/wallpapers"),
    enabled: isAuthenticated && canManage,
  });
  const current = list.data?.items.find((w) => w.id === selected?.id) ?? selected;
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const dirty =
    (uploadOpen && !!file) ||
    (editing && (title !== current?.title || description !== (current?.description ?? "")));
  const navigationBlocker = useBlocker({
    shouldBlockFn: () => dirty,
    withResolver: true,
    enableBeforeUnload: dirty,
  });
  function refresh() {
    for (const key of [
      "wallpapers",
      "settings",
      "dashboard-summary",
      "campaigns",
      "history",
      "deployments",
    ])
      void queryClient.invalidateQueries({ queryKey: [key] });
  }
  function campaign(item: WallpaperSummary) {
    void navigate({ to: "/campaigns", search: { wallpaperId: item.id } });
  }
  function details(item: WallpaperSummary, edit = false) {
    setSelected(item);
    setEditing(edit);
    setTitle(item.title);
    setDescription(item.description ?? "");
    editMutation.reset();
  }
  const defaultMutation = useMutation({
    mutationFn: (id: string) =>
      apiPut<{ defaultWallpaperId: string }>(`/wallpapers/${id}/default`, {}),
    onSuccess: () => {
      setDefaultItem(null);
      refresh();
      toast.success(
        "Default wallpaper saved. Active campaigns are unchanged; fallback is used by the scheduler when no campaign is active.",
      );
    },
  });
  const editMutation = useMutation({
    mutationFn: () =>
      apiPatch<WallpaperSummary>(`/wallpapers/${current!.id}`, {
        title: title.trim(),
        description: description.trim() || null,
      }),
    onSuccess: (item) => {
      setSelected(item);
      setEditing(false);
      refresh();
      toast.success("Wallpaper details saved");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/wallpapers/${id}`),
    onSuccess: () => {
      setDeleteItem(null);
      setSelected(null);
      refresh();
      toast.success("Wallpaper deleted");
    },
    onError: () => refresh(),
  });
  const previewMutation = useMutation({
    mutationFn: async (source: File) => {
      const body = new FormData();
      body.append("file", source);
      return apiUploadPreview(body);
    },
    onSuccess: setPreview,
  });
  const uploadMutation = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.append("title", uploadTitle.trim());
      body.append("description", uploadDescription.trim());
      body.append("file", file!);
      return apiUpload<WallpaperSummary>("/wallpapers", body);
    },
    onSuccess: (item) => {
      closeUpload();
      refresh();
      details(item);
      toast.success("Wallpaper saved. Create a campaign or choose it as the default when ready.");
    },
  });
  function closeUpload() {
    setUploadOpen(false);
    setFile(null);
    setPreview("");
    setFileError("");
  }
  function chooseFile(next: File) {
    setFile(next);
    setPreview("");
    setUploadTitle(next.name.replace(/\.[^.]+$/, "").slice(0, 200));
    setUploadDescription("");
    previewMutation.reset();
    uploadMutation.reset();
    const issue = !/\.(jpe?g|png)$/i.test(next.name)
      ? "Choose a JPG or PNG file."
      : next.size === 0
        ? "This file is empty."
        : next.size > 64 * 1024 * 1024
          ? "The file exceeds the 64 MiB upload limit."
          : "";
    setFileError(issue);
    if (!issue) previewMutation.mutate(next);
  }
  async function download(item: WallpaperSummary) {
    try {
      const url = await apiImageUrl(resolveApiPath(item.imageUrl));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(message(error));
    }
  }
  const rows = useMemo(
    () =>
      (list.data?.items ?? [])
        .filter((item) => {
          const matches = `${item.title} ${item.filename} ${item.description ?? ""}`
            .toLowerCase()
            .includes(q.toLowerCase());
          const uses = item.campaigns ?? [];
          return (
            matches &&
            (filter === "ALL" ||
              (filter === "DEFAULT" && item.isDefault) ||
              (filter === "ACTIVE" && uses.some((c) => c.status === "ACTIVE")) ||
              (filter === "SCHEDULED" && uses.some((c) => c.status === "SCHEDULED")) ||
              (filter === "UNUSED" && !uses.length && !item.isDefault))
          );
        })
        .sort((a, b) =>
          sort === "NAME"
            ? a.title.localeCompare(b.title)
            : sort === "SIZE"
              ? b.sizeBytes - a.sizeBytes
              : b.uploadedAt.localeCompare(a.uploadedAt),
        ),
    [list.data, q, filter, sort],
  );
  const busyUpload = previewMutation.isPending || uploadMutation.isPending;
  const chooseDefault = (item: WallpaperSummary) => {
    setSelected(null);
    defaultMutation.reset();
    setDefaultItem(item);
  };
  function actions(item: WallpaperSummary) {
    return (
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={() => campaign(item)}>
          <Plus className="w-4 h-4 mr-1" />
          Create campaign
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label={`Actions for ${item.title}`}>
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isAdmin && (
              <DropdownMenuItem disabled={item.isDefault} onSelect={() => chooseDefault(item)}>
                {item.isDefault ? "Default wallpaper" : "Set as default wallpaper"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => details(item, true)}>Edit details</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void download(item)}>Download JPG</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setSelected(null);
                deleteMutation.reset();
                setDeleteItem(item);
              }}
            >
              Delete wallpaper
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
  if (!canManage)
    return (
      <AppLayout title="Wallpaper Library">
        <p>Your role does not have access to the wallpaper library.</p>
      </AppLayout>
    );
  return (
    <AppLayout
      title="Wallpaper Library"
      subtitle="Choose a wallpaper, create a campaign, or manage your default."
    >
      <div className="mb-5 rounded-xl border bg-card p-4 text-sm">
        <strong>Default wallpaper: </strong>
        {list.data
          ? (list.data.items.find((w) => w.isDefault)?.title ?? "Not selected")
          : list.error
            ? "Unavailable"
            : "Loading…"}
        <p className="text-muted-foreground mt-1">
          Used when no campaign is active. Uploading or selecting a default does not interrupt an
          active campaign.
        </p>
        {!isAdmin && (
          <p className="text-muted-foreground mt-1">
            Only Administrators can change the default wallpaper.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3 items-center mb-5">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            aria-label="Search wallpapers"
            placeholder="Search wallpapers…"
            className="pl-9 pr-10"
            value={q}
            onChange={(e) =>
              void navigate({
                to: "/wallpapers",
                search: { q: e.target.value, filter, sort },
                replace: true,
              })
            }
          />
          {q && (
            <Button
              className="absolute right-0 top-0"
              variant="ghost"
              size="icon"
              aria-label="Clear search"
              onClick={() => {
                void navigate({
                  to: "/wallpapers",
                  search: { q: "", filter, sort },
                  replace: true,
                });
                searchRef.current?.focus();
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        <Select
          value={filter}
          onValueChange={(v) =>
            void navigate({
              to: "/wallpapers",
              search: { q, filter: v as keyof typeof filters, sort },
              replace: true,
            })
          }
        >
          <SelectTrigger className="w-44" aria-label="Filter wallpapers">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(filters).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(v) =>
            void navigate({
              to: "/wallpapers",
              search: { q, filter, sort: v as keyof typeof sorts },
              replace: true,
            })
          }
        >
          <SelectTrigger className="w-40" aria-label="Sort wallpapers">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(sorts).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={() => {
            previewMutation.reset();
            uploadMutation.reset();
            setUploadOpen(true);
          }}
        >
          <Upload className="w-4 h-4 mr-2" />
          Upload wallpaper
        </Button>
      </div>
      {list.isPending ? (
        <p role="status">Loading wallpapers…</p>
      ) : list.error ? (
        <div role="alert">
          <p>{message(list.error)}</p>
          <Button variant="outline" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : !rows.length ? (
        <div className="p-8 border border-dashed rounded-xl text-center">
          <p>
            {q || filter !== "ALL"
              ? "No wallpapers match your search or filter."
              : "Your library is empty. Upload a wallpaper to get started."}
          </p>
          {(q || filter !== "ALL") && (
            <Button
              variant="outline"
              onClick={() =>
                void navigate({ to: "/wallpapers", search: { q: "", filter: "ALL", sort } })
              }
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {rows.map((item) => (
            <article key={item.id} className="rounded-xl border bg-card overflow-hidden">
              <WallpaperImage source={item.imageUrl} title={item.title} />
              <div className="p-4 space-y-3">
                <StatusBadges item={item} />
                <h2 className="font-semibold break-words">{item.title}</h2>
                <p className="text-xs text-muted-foreground">
                  {item.resolution} · {formatBytes(item.sizeBytes)}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => details(item)}>
                    Preview
                  </Button>
                  {actions(item)}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !editMutation.isPending) {
            if (editing && dirty) setDiscard("edit");
            else {
              setSelected(null);
              setEditing(false);
            }
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{current?.title ?? "Wallpaper details"}</DialogTitle>
            <DialogDescription>
              Review the published image, details, and campaign usage.
            </DialogDescription>
          </DialogHeader>
          {current && (
            <>
              <WallpaperImage source={current.imageUrl} title={current.title} />
              <StatusBadges item={current} />
              <p className="text-sm text-muted-foreground">
                {current.resolution} · {formatBytes(current.sizeBytes)} · Uploaded{" "}
                {formatDateTime(current.uploadedAt)}
                {current.uploadedBy ? ` by ${current.uploadedBy}` : ""}
              </p>
              {editing ? (
                <form
                  noValidate
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (title.trim()) editMutation.mutate();
                  }}
                >
                  <Label htmlFor="wallpaper-title">Title</Label>
                  <Input
                    id="wallpaper-title"
                    disabled={editMutation.isPending}
                    autoFocus
                    value={title}
                    maxLength={200}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <Label htmlFor="wallpaper-description">Description</Label>
                  <Textarea
                    id="wallpaper-description"
                    disabled={editMutation.isPending}
                    className="resize-none min-h-28"
                    value={description}
                    maxLength={2000}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  {editMutation.error && (
                    <p role="alert" className="text-destructive">
                      {message(editMutation.error)}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button disabled={!title.trim() || editMutation.isPending}>
                      {editMutation.isPending ? "Saving…" : "Save details"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={editMutation.isPending}
                      onClick={() => (dirty ? setDiscard("edit") : setEditing(false))}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap">
                    {current.description || "No description yet."}
                  </p>
                  {actions(current)}
                  {isAdmin && !current.isDefault && (
                    <Button variant="outline" onClick={() => chooseDefault(current)}>
                      Set as default wallpaper
                    </Button>
                  )}
                </>
              )}
              <section className="border-t pt-4 space-y-3">
                <h3 className="font-semibold">Used by campaigns</h3>
                {!current.campaigns?.length ? (
                  <p className="text-sm text-muted-foreground">
                    No campaigns use this wallpaper yet.
                  </p>
                ) : (
                  current.campaigns.map((c) => (
                    <div
                      key={c.id}
                      className="flex justify-between gap-3 border rounded-md p-3 text-sm"
                    >
                      <div>
                        <Link
                          className="underline font-medium"
                          to="/campaigns"
                          search={{ campaignId: c.id }}
                        >
                          {c.name}
                        </Link>
                        <p className="text-muted-foreground">
                          {c.startDate ? formatDateTime(c.startDate) : "No start date"} —{" "}
                          {c.endDate ? formatDateTime(c.endDate) : "No end date"}
                        </p>
                      </div>
                      <Badge variant="outline">{c.status}</Badge>
                    </div>
                  ))
                )}
              </section>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          if (!open && !busyUpload) {
            if (file) setDiscard("upload");
            else closeUpload();
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload wallpaper</DialogTitle>
            <DialogDescription>
              JPG or PNG, up to 64 MiB. Review the final 1920 × 1080 JPG before saving. Images are
              centre-cropped to fit.
            </DialogDescription>
          </DialogHeader>
          <input
            ref={fileRef}
            type="file"
            accept=".jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) chooseFile(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <Button variant="outline" disabled={busyUpload} onClick={() => fileRef.current?.click()}>
            {file ? "Choose another file" : "Choose file"}
          </Button>
          {file && (
            <p className="text-sm break-words">
              {file.name} · {formatBytes(file.size)}
            </p>
          )}
          {fileError && (
            <p role="alert" className="text-destructive">
              {fileError}
            </p>
          )}
          {previewMutation.isPending && <p role="status">Uploading and preparing preview…</p>}
          {previewMutation.error && (
            <div role="alert">
              <p className="text-destructive">{message(previewMutation.error)}</p>
              <Button variant="outline" onClick={() => file && previewMutation.mutate(file)}>
                Try preview again
              </Button>
            </div>
          )}
          {preview && (
            <>
              <img
                src={preview}
                alt="Final wallpaper preview"
                className="w-full aspect-video object-contain rounded-md"
              />
              <p className="text-xs text-muted-foreground">
                Check that logos and text are fully visible. This is the normalized image that will
                be saved.
              </p>
            </>
          )}
          <form
            noValidate
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (preview && uploadTitle.trim()) uploadMutation.mutate();
            }}
          >
            <Label htmlFor="upload-title">Title</Label>
            <Input
              id="upload-title"
              value={uploadTitle}
              maxLength={200}
              disabled={busyUpload}
              onChange={(e) => setUploadTitle(e.target.value)}
            />
            <Label htmlFor="upload-description">Description (optional)</Label>
            <Textarea
              id="upload-description"
              className="resize-none min-h-24"
              value={uploadDescription}
              maxLength={2000}
              disabled={busyUpload}
              onChange={(e) => setUploadDescription(e.target.value)}
            />
            {uploadMutation.error && (
              <p role="alert" className="text-destructive">
                {message(uploadMutation.error)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Saving adds this image to the library. It does not publish it or create a campaign.
            </p>
            <Button disabled={!preview || !uploadTitle.trim() || busyUpload}>
              {uploadMutation.isPending ? "Saving wallpaper…" : "Save to Library"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!defaultItem}
        onOpenChange={(open) => !open && !defaultMutation.isPending && setDefaultItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set default wallpaper?</AlertDialogTitle>
            <AlertDialogDescription>
              Use “{defaultItem?.title}” when no campaign is active. Active campaigns stay
              unchanged. The scheduler applies the fallback; this does not immediately update every
              computer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {defaultItem && (
            <WallpaperImage source={defaultItem.imageUrl} title={defaultItem.title} />
          )}
          {defaultMutation.error && (
            <p role="alert" className="text-destructive">
              {message(defaultMutation.error)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={defaultMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={defaultMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (defaultItem) defaultMutation.mutate(defaultItem.id);
              }}
            >
              {defaultMutation.isPending ? "Saving…" : "Set as default"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!deleteItem}
        onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleteItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteItem && deletionReason(deleteItem)
                ? "Wallpaper is protected"
                : "Delete wallpaper?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteItem &&
                (deletionReason(deleteItem) ||
                  `Delete “${deleteItem.title}”? This cannot be undone. Historical campaign records are retained.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.error && (
            <p role="alert" className="text-destructive">
              {message(deleteMutation.error)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            {deleteItem && deletionReason(deleteItem) ? (
              <Button
                onClick={() => {
                  details(deleteItem);
                  setDeleteItem(null);
                }}
              >
                Review wallpaper
              </Button>
            ) : (
              <AlertDialogAction
                disabled={deleteMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (deleteItem) deleteMutation.mutate(deleteItem.id);
                }}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete wallpaper"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={navigationBlocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) navigationBlocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              Your wallpaper changes have not been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => navigationBlocker.reset?.()}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => navigationBlocker.proceed?.()}>
              Leave page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!discard} onOpenChange={(open) => !open && setDiscard(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>Your changes have not been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (discard === "upload") closeUpload();
                else {
                  setEditing(false);
                  setTitle(current?.title ?? "");
                  setDescription(current?.description ?? "");
                }
                setDiscard(null);
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
