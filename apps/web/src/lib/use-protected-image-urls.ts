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

  useEffect(() => {
    if (!enabled || !items?.length) {
      setImageUrls({});
      return;
    }

    let cancelled = false;
    const allocated: string[] = [];

    void Promise.all(
      items.map(async (item) => {
        const source = getImageUrl(item);
        if (!source) {
          return [getId(item), ""] as const;
        }

        const objectUrl = await apiImageUrl(resolveApiPath(source));
        allocated.push(objectUrl);
        return [getId(item), objectUrl] as const;
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
      .catch(() => {
        if (!cancelled) {
          setImageUrls({});
        }
      });

    return () => {
      cancelled = true;
      allocated.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [enabled, getId, getImageUrl, items]);

  return imageUrls;
}
