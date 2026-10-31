import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { CategoryArtwork } from "@/components/store/CategoryArtwork";
vi.mock("@/lib/config", () => ({ isDemoMode: false, config: { imageBaseUrl: "" } }));
afterEach(cleanup);
const category = { slug: "flowers-plants", name: "Flowers", blurb: "", image: "" };
it("uses the exact category slug independent of sort order", () => {
  const view = render(<CategoryArtwork category={category} />);
  expect(view.container.querySelector("img")).toHaveAttribute(
    "src",
    "/categories/flowers-plants-v1.webp",
  );
});
it("prefers saved artwork and recovers from a broken saved URL", () => {
  const view = render(<CategoryArtwork category={{ ...category, image: "/custom.webp" }} />);
  expect(view.container.querySelector("img")).toHaveAttribute("src", "/custom.webp");
  fireEvent.error(view.container.querySelector("img")!);
  expect(view.container.querySelector("img")).toHaveAttribute(
    "src",
    "/categories/flowers-plants-v1.webp",
  );
  fireEvent.error(view.container.querySelector("img")!);
  expect(view.container.querySelector("img")).toBeNull();
});
it("does not give unknown categories unrelated artwork", () => {
  const view = render(<CategoryArtwork category={{ ...category, slug: "new-category" }} />);
  expect(view.container.querySelector("img")).toBeNull();
});
