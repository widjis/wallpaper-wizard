import { useEffect, useState } from "react";
import { apiImageUrl, resolveApiPath } from "./api";

interface UseProtectedImageUrlsOptions<T> {
  items: T[] | undefined;
  enabled?: boolean;
  getId: (item: T) => string;
  getImageUrl: (item: T) => string | null | undefined;
}

export function useProtectedImageUrls<T>({
  items,
  enabled = true,
  getId,
  getImageUrl,
}: UseProtectedImageUrlsOptions<T>) {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const requestKey = JSON.stringify(
    (items ?? []).map((item) => ({
      id: getId(item),
      source: getImageUrl(item) ?? null,
    })),
  );

  useEffect(() => {
    const requests = JSON.parse(requestKey) as Array<{ id: string; source: string | null }>;
    if (!enabled || !requests.length) {
      setImageUrls({});
      return;
    }

    let cancelled = false;
    const allocated: string[] = [];

    void Promise.all(
      requests.map(async ({ id, source }) => {
        if (!source) {
          return [id, ""] as const;
        }

        try {
          const objectUrl = await apiImageUrl(resolveApiPath(source));
          allocated.push(objectUrl);
          return [id, objectUrl] as const;
        } catch {
          return [id, ""] as const;
        }
      }),
    )
      .then((entries) => {
        if (cancelled) {
          entries.forEach(([, url]) => {
            if (url) URL.revokeObjectURL(url);
          });
          return;
        }

        setImageUrls(
          Object.fromEntries(entries.filter(([, url]) => Boolean(url))) as Record<string, string>,
        );
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      allocated.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [enabled, requestKey]);

  return imageUrls;
}
