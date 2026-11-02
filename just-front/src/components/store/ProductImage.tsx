import { UiAttributes } from "@/lib/i18n/Language";
import { useState } from "react";
import { ImageOff } from "lucide-react";
import { imageUrl } from "@/lib/image";
import { cn } from "@/lib/utils";

export function ProductImage({
  src,
  alt,
  className,
  width = 600,
  eager,
  fallbackSrc,
}: {
  src?: string;
  alt: string;
  className?: string;
  width?: number;
  eager?: boolean;
  fallbackSrc?: string;
}) {
  const url = imageUrl(src, { width });
  return (
    <LoadedImage
      key={url ?? "missing"}
      url={url}
      alt={alt}
      width={width}
      eager={eager}
      className={className}
      fallbackUrl={imageUrl(fallbackSrc, { width })}
    />
  );
}

function LoadedImage({
  url,
  alt,
  width,
  eager,
  className,
  fallbackUrl,
}: {
  url?: string;
  alt: string;
  width: number;
  eager?: boolean;
  className?: string;
  fallbackUrl?: string;
}) {
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (broken && fallbackUrl && fallbackUrl !== url) {
    return (
      <LoadedImage
        key={fallbackUrl}
        url={fallbackUrl}
        alt={alt}
        width={width}
        eager={eager}
        className={className}
      />
    );
  }
  if (!url || broken) {
    return (
      <UiAttributes>
        <div
          role={alt ? "img" : undefined}
          aria-label={alt ? `${alt}: image unavailable` : undefined}
          className={cn(
            "flex aspect-square items-center justify-center bg-muted text-muted-foreground",
            className,
          )}
        >
          <ImageOff className="size-6" aria-hidden />
        </div>
      </UiAttributes>
    );
  }
  return (
    <span
      className={cn("relative block aspect-square overflow-hidden bg-muted", className)}
      aria-busy={!loaded}
    >
      {!loaded && (
        <span
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-muted to-secondary motion-safe:animate-pulse"
          aria-hidden
        />
      )}
      <img
        src={url}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        width={width}
        height={width}
        onError={() => setBroken(true)}
        onLoad={() => setLoaded(true)}
        decoding="async"
        className={cn(
          "h-full w-full object-cover transition-opacity motion-reduce:transition-none",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </span>
  );
}
