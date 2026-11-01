/** Baseline browser protection; deliberately does not restrict provider scripts. */
export function secureResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
  // Retain any stricter policy supplied by the framework/hosting layer.
  if (!headers.has("Content-Security-Policy")) {
    headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    );
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
