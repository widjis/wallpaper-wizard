import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiImageUrl, resolveApiPath } from "@/lib/api";

export function WallpaperImage({ source, title }: { source: string; title: string }) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let allocated = "";
    setUrl("");
    setFailed(false);
    void apiImageUrl(resolveApiPath(source))
      .then((result) => {
        if (cancelled) {
          URL.revokeObjectURL(result);
          return;
        }
        allocated = result;
        setUrl(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (allocated) URL.revokeObjectURL(allocated);
    };
  }, [source, attempt]);
  return (
    <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden rounded-md">
      {failed ? (
        <div className="p-4 text-center text-sm" role="status">
          <p>Preview unavailable.</p>
          <Button variant="outline" size="sm" onClick={() => setAttempt((v) => v + 1)}>
            Try again
          </Button>
        </div>
      ) : url ? (
        <img
          src={url}
          alt={title}
          className="w-full h-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <p className="text-sm text-muted-foreground" role="status">
          Loading preview…
        </p>
      )}
    </div>
  );
}
