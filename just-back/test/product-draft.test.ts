import { afterEach, expect, it, vi } from "vitest";
import { generateDraft, draftSchema } from "../src/ai/product-draft.js";
import type { Config } from "../src/config/env.js";
const config = { GEMINI_API_KEY: "test-only-key", GEMINI_MODEL: "gemini-2.5-flash" } as Config;
const categories = [{ id: "own-category", name: "Food" }];
function reply(value: object) {
  const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] }), { status: 200 }));
  vi.stubGlobal("fetch", mock); return mock;
}
afterEach(() => vi.unstubAllGlobals());
it("returns only a validated draft and sends the key in a header, not URL", async () => {
  const draft = { name: "Rice", description: "Rice pack", unit: "", categoryId: "own-category" };
  const fetch = reply(draft);
  expect(await generateDraft(config, Buffer.from("photo"), categories)).toEqual(draft);
  expect(fetch.mock.calls[0][0]).not.toContain(config.GEMINI_API_KEY);
  expect(fetch.mock.calls[0][1].headers["x-goog-api-key"]).toBe(config.GEMINI_API_KEY);
});
it("discards a category outside the seller's permitted list", async () => {
  reply({ name: "Rice", description: "", unit: "", categoryId: "another-shop-category" });
  expect((await generateDraft(config, Buffer.from("photo"), categories)).categoryId).toBe("");
});
it("rejects price and stock rather than accepting model-generated commerce fields", async () => {
  reply({ name: "Rice", description: "", unit: "", categoryId: "", price: 1, stock: 99 });
  await expect(generateDraft(config, Buffer.from("photo"), categories)).rejects.toMatchObject({ code: "AI_DRAFT_FAILED" });
});
it("does not leak provider errors or credentials", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider details", { status: 401 })));
  await expect(generateDraft(config, Buffer.from("photo"), categories)).rejects.toMatchObject({ message: "Could not generate details. Retry later or fill the form manually." });
});
it("rejects malformed and oversized fields", () => {
  expect(draftSchema.safeParse({ name: "x".repeat(161), description: "", unit: "", categoryId: "" }).success).toBe(false);
  expect(draftSchema.safeParse({ name: "Rice" }).success).toBe(false);
});
