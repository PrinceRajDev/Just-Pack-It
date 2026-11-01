import { describe, expect, it } from "vitest";
import { secureResponse } from "../lib/security-headers";

describe("frontend response security", () => {
  it.each([200, 401, 500])(
    "protects %s responses without changing body, status or cookies",
    async (status) => {
      const response = secureResponse(
        new Response("safe body", {
          status,
          headers: {
            "Content-Type": "text/html",
            "Set-Cookie": "fixture=value; HttpOnly",
            "Cache-Control": "private, no-store",
          },
        }),
      );
      expect(response.status).toBe(status);
      expect(await response.text()).toBe("safe body");
      expect(response.headers.get("Set-Cookie")).toBe("fixture=value; HttpOnly");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      expect(response.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
      expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(response.headers.get("Permissions-Policy")).toContain("geolocation=(self)");
    },
  );
  it("retains a stricter existing CSP and redirects", () => {
    const response = secureResponse(
      new Response(null, {
        status: 302,
        headers: { Location: "/login", "Content-Security-Policy": "default-src 'none'" },
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
    expect(response.headers.get("Content-Security-Policy")).toBe("default-src 'none'");
  });
});
