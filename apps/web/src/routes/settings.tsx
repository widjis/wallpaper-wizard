import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiPut } from "@/lib/api";
import type { AppSettings } from "@cwcm/types";

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
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet<AppSettings>("/settings"),
  });

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
          />
          <Field
            label="Wallpaper filename"
            value={form.wallpaperFilename}
            onChange={(value) => setForm({ ...form, wallpaperFilename: value })}
          />
          <Field
            label="Storage location"
            value={form.storageLocation}
            onChange={(value) => setForm({ ...form, storageLocation: value })}
          />
        </Section>

        <Section title="Scheduler">
          <Field
            label="Scheduler interval (minutes)"
            value={String(form.schedulerIntervalMinutes)}
            onChange={(value) => setForm({ ...form, schedulerIntervalMinutes: Number(value) || 1 })}
          />
          <Field
            label="Deployment timeout (seconds)"
            value={String(form.deploymentTimeoutSeconds)}
            onChange={(value) => setForm({ ...form, deploymentTimeoutSeconds: Number(value) || 1 })}
          />
          <Field
            label="Retry attempts"
            value={String(form.retryAttempts)}
            onChange={(value) => setForm({ ...form, retryAttempts: Number(value) || 0 })}
          />
        </Section>

        <Section title="Uploads">
          <Field
            label="Max upload size (MB)"
            value={String(form.maxUploadSizeMb)}
            onChange={(value) => setForm({ ...form, maxUploadSizeMb: Number(value) || 1 })}
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
          />
        </Section>

        <Section title="Preferences">
          <ToggleRow
            label="Auto-retry failed deployments"
            description="Retry failed jobs using policy above."
            checked={form.autoRetryFailedDeployments}
            onCheckedChange={(value) => setForm({ ...form, autoRetryFailedDeployments: value })}
          />
          <ToggleRow
            label="Overwrite existing wallpaper"
            description="Replace Wallpaper.jpg on SYSVOL every deploy."
            checked={form.overwriteExistingWallpaper}
            onCheckedChange={(value) => setForm({ ...form, overwriteExistingWallpaper: value })}
          />
        </Section>
      </div>

      <div className="mt-6 flex gap-3">
        <Button onClick={() => saveMutation.mutate(form)}>Save changes</Button>
        <Button variant="outline" onClick={() => data && setForm(data)}>
          Reset
        </Button>
      </div>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
