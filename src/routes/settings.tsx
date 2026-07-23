import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — CWCM" },
      { name: "description", content: "Configure SYSVOL path, scheduler, upload limits, and system preferences." },
      { property: "og:title", content: "Settings — CWCM" },
      { property: "og:description", content: "Configure SYSVOL path, scheduler, upload limits, and system preferences." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <AppLayout title="Settings" subtitle="Configure the wallpaper campaign system">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-5xl">
        <Section title="Deployment target">
          <Field label="SYSVOL path" defaultValue="\\CORP\SYSVOL\corp.intra.local\Wallpaper\" />
          <Field label="Wallpaper filename" defaultValue="Wallpaper.jpg" />
          <Field label="Storage location" defaultValue="/var/lib/cwcm/wallpapers" />
        </Section>

        <Section title="Scheduler">
          <Field label="Scheduler interval (minutes)" defaultValue="1" />
          <Field label="Deployment timeout (seconds)" defaultValue="60" />
          <Field label="Retry attempts" defaultValue="3" />
        </Section>

        <Section title="Uploads">
          <Field label="Max upload size (MB)" defaultValue="20" />
          <Field label="Allowed extensions" defaultValue=".jpg, .jpeg, .png" />
        </Section>

        <Section title="Preferences">
          <ToggleRow label="Email notifications" description="Send deployment reports to admins." defaultChecked />
          <ToggleRow label="Auto-retry failed deployments" description="Retry failed jobs using policy above." defaultChecked />
          <ToggleRow label="Overwrite existing wallpaper" description="Replace Wallpaper.jpg on SYSVOL every deploy." defaultChecked />
        </Section>
      </div>

      <div className="mt-6 flex gap-3">
        <Button>Save changes</Button>
        <Button variant="outline">Reset</Button>
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

function Field({ label, defaultValue }: { label: string; defaultValue: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input defaultValue={defaultValue} />
    </div>
  );
}

function ToggleRow({ label, description, defaultChecked }: { label: string; description: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch defaultChecked={defaultChecked} />
    </div>
  );
}