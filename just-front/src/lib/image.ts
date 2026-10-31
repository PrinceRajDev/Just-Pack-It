import { config } from "@/lib/config";

/**
 * Image service abstraction. When VITE_IMAGE_BASE_URL points at a Cloudflare
 * Images / Image Resizing endpoint, remote keys are rewritten to
 * `${base}/cdn-cgi/image/width=W,quality=Q,format=auto/${key}`.
 * Bundled/local URLs pass through untouched.
 */
export function imageUrl(src: string | undefined, opts: { width?: number; quality?: number } = {}) {
  if (!src) return undefined;
  if (
    !config.imageBaseUrl ||
    src.startsWith("/") ||
    src.startsWith("data:") ||
    src.startsWith("blob:") ||
    src.startsWith("http")
  )
    return src;
  const params = [
    `width=${opts.width ?? 600}`,
    `quality=${opts.quality ?? 80}`,
    "format=auto",
  ].join(",");
  return `${config.imageBaseUrl}/cdn-cgi/image/${params}/${src}`;
}

export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
