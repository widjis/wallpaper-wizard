import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiPut } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isAdministrator } from "@/lib/roles";
import type { AppSettings, WallpaperSummary } from "@cwcm/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — CWCM" },
      {
        name: "description",
        content: "Configure SYSVOL path, scheduler, upload limits, and system preferences.",
      },
      { property: "og:title", content: "Settings — CWCM" },
      {
        property: "og:description",
        content: "Configure SYSVOL path, scheduler, upload limits, and system preferences.",
      },
    ],
  }),
  component: Page,
});

function Page() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<AppSettings>("/settings"),
  });
  const wallpapersQuery = useQuery({
    queryKey: ["wallpapers"],
    queryFn: () => apiGet<{ items: WallpaperSummary[] }>("/wallpapers"),
  });
  const canManage = isAdministrator(session?.user.role);

  const [form, setForm] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (payload: AppSettings) => apiPut<AppSettings>("/settings", payload),
    onSuccess: (payload) => {
      setForm(payload);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["wallpapers"] });
      queryClient.invalidateQueries({ queryKey: ["deployments"] });
      queryClient.invalidateQueries({ queryKey: ["history"] });
      toast.success("Settings saved");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to save settings");
    },
  });

  if (!form) {
    return (
      <AppLayout title="Settings" subtitle="Configure the wallpaper campaign system">
        <div className="text-sm text-muted-foreground">Loading settings...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Settings" subtitle="Configure the wallpaper campaign system">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl">
        <Section title="Deployment target">
          <Field
            label="SYSVOL path"
            value={form.sysvolPath}
            onChange={(value) => setForm({ ...form, sysvolPath: value })}
            disabled={!canManage}
          />
          <Field
            label="Wallpaper filename"
            value={form.wallpaperFilename}
            onChange={(value) => setForm({ ...form, wallpaperFilename: value })}
            disabled={!canManage}
          />
          <div className="space-y-1.5">
            <Label>Default wallpaper</Label>
            <Select
              value={form.defaultWallpaperId ?? "__none__"}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  defaultWallpaperId: value === "__none__" ? null : value,
                })
              }
              disabled={
                !canManage || wallpapersQuery.isPending || !wallpapersQuery.data?.items.length
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select default wallpaper" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No default wallpaper</SelectItem>
                {(wallpapersQuery.data?.items ?? []).map((wallpaper) => (
                  <SelectItem key={wallpaper.id} value={wallpaper.id}>
                    {wallpaper.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">
              Used automatically when no campaign is active or the active campaign has finished.
            </div>
          </div>
          <Field
            label="Storage location"
            value={form.storageLocation}
            onChange={(value) => setForm({ ...form, storageLocation: value })}
            disabled={!canManage}
          />
        </Section>

        <Section title="Scheduler">
          <Field
            label="Scheduler interval (minutes)"
            value={String(form.schedulerIntervalMinutes)}
            onChange={(value) => setForm({ ...form, schedulerIntervalMinutes: Number(value) || 1 })}
            disabled={!canManage}
          />
          <Field
            label="Deployment timeout (seconds)"
            value={String(form.deploymentTimeoutSeconds)}
            onChange={(value) => setForm({ ...form, deploymentTimeoutSeconds: Number(value) || 1 })}
            disabled={!canManage}
          />
          <Field
            label="Retry attempts"
            value={String(form.retryAttempts)}
            onChange={(value) => setForm({ ...form, retryAttempts: Number(value) || 0 })}
            disabled={!canManage}
          />
        </Section>

        <Section title="Uploads">
          <Field
            label="Max upload size (MB)"
            value={String(form.maxUploadSizeMb)}
            onChange={(value) => setForm({ ...form, maxUploadSizeMb: Number(value) || 1 })}
            disabled={!canManage}
          />
          <Field
            label="Allowed extensions"
            value={form.allowedExtensions.join(", ")}
            onChange={(value) =>
              setForm({
                ...form,
                allowedExtensions: value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
            disabled={!canManage}
          />
        </Section>

        <Section title="Preferences">
          <ToggleRow
            label="Auto-retry failed deployments"
            description="Retry failed jobs using policy above."
            checked={form.autoRetryFailedDeployments}
            onCheckedChange={(value) => setForm({ ...form, autoRetryFailedDeployments: value })}
            disabled={!canManage}
          />
          <ToggleRow
            label="Overwrite existing wallpaper"
            description="Replace Wallpaper.jpg on SYSVOL every deploy."
            checked={form.overwriteExistingWallpaper}
            onCheckedChange={(value) => setForm({ ...form, overwriteExistingWallpaper: value })}
            disabled={!canManage}
          />
        </Section>
      </div>

      <div className="mt-6 flex gap-3">
        <Button
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending || !canManage}
        >
          {saveMutation.isPending ? "Saving..." : "Save changes"}
        </Button>
        <Button variant="outline" onClick={() => data && setForm(data)} disabled={!canManage}>
          Reset
        </Button>
      </div>
      {!canManage ? (
        <div className="mt-3 text-sm text-muted-foreground">
          Your role can view settings but cannot change them.
        </div>
      ) : null}
      {saveMutation.isSuccess ? (
        <div className="mt-3 text-sm text-success">Settings saved successfully.</div>
      ) : null}
    </AppLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-base font-bold mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  label: string;
  description: string;
  checked?: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
