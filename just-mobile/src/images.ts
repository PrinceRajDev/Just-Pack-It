const website = "https://justpackit.vercel.app";
const imageBase = process.env.EXPO_PUBLIC_IMAGE_BASE_URL?.replace(/\/$/, "");
export function resolveImage(value?: string): string | undefined {
  const source = value?.trim();
  if (!source) return undefined;
  if (source.startsWith("https://")) return source;
  if (source.startsWith("/") && !source.startsWith("//")) return `${website}${source}`;
  if (/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(source) && !source.split("/").includes("..") && imageBase?.startsWith("https://")) return `${imageBase}/cdn-cgi/image/width=600,quality=80,format=auto/${source}`;
  return undefined;
}
