import { createFileRoute } from "@tanstack/react-router";
import { Pause, Play, GripVertical, X, Rocket } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import safetyImg from "@/assets/wallpaper-safety.jpg";
import independenceImg from "@/assets/wallpaper-independence.jpg";
import anniversaryImg from "@/assets/wallpaper-anniversary.jpg";
import christmasImg from "@/assets/wallpaper-christmas.jpg";

export const Route = createFileRoute("/timeline")({
  head: () => ({
    meta: [
      { title: "Timeline & Queue — CWCM" },
      { name: "description", content: "View and reorder the wallpaper deployment queue." },
      { property: "og:title", content: "Timeline & Queue — CWCM" },
      { property: "og:description", content: "View and reorder the wallpaper deployment queue." },
    ],
  }),
  component: Page,
});

const queue = [
  { pos: "NOW", name: "Safety Awareness 2026", when: "23 Jul – 31 Jul 2026", img: safetyImg, tone: "success" },
  { pos: "NEXT", name: "Independence Day", when: "1 Aug – 17 Aug 2026", img: independenceImg, tone: "info" },
  { pos: "NEXT", name: "Company Anniversary", when: "1 Sep – 7 Sep 2026", img: anniversaryImg, tone: "info" },
  { pos: "NEXT", name: "Christmas 2026", when: "20 Dec – 31 Dec 2026", img: christmasImg, tone: "info" },
];

function Page() {
  return (
    <AppLayout title="Timeline & Queue" subtitle="Deployment order of upcoming campaigns">
      <div className="flex items-center gap-3 mb-6">
        <div>
          <div className="text-sm text-muted-foreground">Queue Status</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="font-semibold">Running</span>
          </div>
        </div>
        <div className="flex-1" />
        <Button variant="outline"><Pause className="h-4 w-4 mr-2" />Pause Queue</Button>
        <Button variant="outline"><Play className="h-4 w-4 mr-2" />Resume</Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="relative space-y-3">
          {queue.map((q, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-lg border border-border">
              <div className={`w-20 text-center text-xs font-bold py-1 rounded ${q.tone === "success" ? "bg-success-soft text-success" : "bg-info-soft text-info"}`}>
                {q.pos}
              </div>
              <img src={q.img} alt={q.name} className="h-14 w-20 object-cover rounded-md" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{q.name}</div>
                <div className="text-xs text-muted-foreground">{q.when}</div>
              </div>
              {q.pos === "NOW" ? (
                <Badge className="bg-success-soft text-success hover:bg-success-soft">Deploying</Badge>
              ) : (
                <>
                  <Button size="sm" variant="outline"><Rocket className="h-3.5 w-3.5 mr-1.5" />Force deploy</Button>
                  <Button size="sm" variant="ghost"><X className="h-4 w-4" /></Button>
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}