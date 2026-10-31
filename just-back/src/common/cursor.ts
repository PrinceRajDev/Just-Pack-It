import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { fail } from "./errors.js";
const dataSchema = z
  .object({
    scope: z.string(),
    sort: z.string(),
    key: z.union([z.string(), z.number()]),
    id: z.string().uuid(),
    expires: z.number(),
  })
  .strict();
type Cursor = z.infer<typeof dataSchema>;
const sign = (body: string, secret: string) =>
  createHmac("sha256", secret).update(body).digest("base64url");
export function encodeCursor(data: Omit<Cursor, "expires">, secret: string) {
  const body = Buffer.from(
    JSON.stringify({ ...data, expires: Date.now() + 3600000 }),
  ).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}
export function decodeCursor(
  cursor: string,
  scope: string,
  sort: string,
  secret: string,
): Cursor {
  try {
    const [body, signature, ...rest] = cursor.split(".");
    const expected = Buffer.from(sign(body, secret));
    const actual = Buffer.from(signature ?? "");
    if (
      rest.length ||
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    )
      throw Error();
    const data = dataSchema.parse(
      JSON.parse(Buffer.from(body, "base64url").toString()),
    );
    if (data.scope !== scope || data.sort !== sort || data.expires < Date.now())
      throw Error();
    return data;
  } catch {
    return fail(
      400,
      "INVALID_CURSOR",
      "Cursor is invalid, expired or belongs to other filters",
    );
  }
}
