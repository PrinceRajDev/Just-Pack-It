/** Dynamic imports remain failed in the current document's module cache. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed/i.test(
    message,
  );
}
