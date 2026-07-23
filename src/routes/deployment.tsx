import { createFileRoute } from "@tanstack/react-router";
import { Rocket, RefreshCw, CheckCircle2 } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import safetyImg from "@/assets/wallpaper-safety.jpg";

export const Route = createFileRoute("/deployment")({
  head: () => ({
    meta: [
      { title: "Deployment — CWCM" },
      { name: "description", content: "Monitor the current wallpaper deployment and SYSVOL publishing status." },
      { property: "og:title", content: "Deployment — CWCM" },
      { property: "og:description", content: "Monitor the current wallpaper deployment and SYSVOL publishing status." },
    ],
  }),
  component: Page,
});

const steps = [
  { label: "Locate wallpaper", status: "done" },
  { label: "Validate file & checksum", status: "done" },
  { label: "Copy to SYSVOL", status: "done" },
  { label: "Replace Wallpaper.jpg", status: "done" },
  { label: "Verify deployment", status: "done" },
  { label: "Write deployment log", status: "done" },
];

function Page() {
  return (
    <AppLayout title="Deployment" subtitle="Current deployment engine status">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-sm text-muted-foreground">Active Deployment</div>
              <h2 className="text-lg font-bold mt-0.5">Safety Awareness 2026</h2>
            </div>
            <Badge className="bg-success-soft text-success hover:bg-success-soft">Success</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <img src={safetyImg} alt="Wallpaper" className="rounded-lg w-full h-48 object-cover" />
            <dl className="space-y-2.5 text-sm">
              <Row label="Target" value="\\CORP\SYSVOL\corp.intra.local\Wallpaper\" />
              <Row label="Filename" value="Wallpaper.jpg" />
              <Row label="Size" value="2.4 MB" />
              <Row label="Checksum" value="a1b2c3d4e5f6…" />
              <Row label="Started" value="23 Jul 2026 08:00:00" />
              <Row label="Finished" value="23 Jul 2026 08:00:15" />
              <Row label="Duration" value="15 s" />
            </dl>
          </div>

          <div className="mt-6 flex gap-3">
            <Button><Rocket className="h-4 w-4 mr-2" />Force redeploy</Button>
            <Button variant="outline"><RefreshCw className="h-4 w-4 mr-2" />Verify SYSVOL</Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-bold mb-4">Deployment steps</h2>
          <ol className="space-y-4">
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-success-soft text-success flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground">Completed</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </AppLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <span className="flex-1 font-medium break-all">{value}</span>
    </div>
  );
}