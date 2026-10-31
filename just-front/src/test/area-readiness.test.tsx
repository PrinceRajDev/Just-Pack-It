import { afterEach, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AreaReadiness } from "@/components/portal/AreaReadiness";
import type { ManagedArea, ManagedShop } from "@/domain/management";
afterEach(cleanup);
const area = {
  id: "area",
  name: "TEST AREA",
  city: "TEST",
  pincodes: ["999999"],
  active: true,
  version: 0,
} satisfies ManagedArea;
const shop = (id: string, extra: Partial<ManagedShop> = {}) =>
  ({
    id,
    name: id,
    serviceAreaIds: ["area"],
    active: true,
    status: "approved",
    ...extra,
  }) as ManagedShop;
it("counts only this area's active approved shops and distinguishes missing pins", () => {
  render(
    <AreaReadiness
      area={area}
      shops={[
        shop("pinned", { location: { type: "Point", coordinates: [86, 26] } }),
        shop("missing"),
        shop("pending", { status: "pending" }),
        shop("inactive", { active: false }),
        shop("elsewhere", { serviceAreaIds: ["other"] }),
      ]}
    />,
  );
  expect(
    screen.getByText(
      /4 assigned shops · 2 active approved · 1 with valid map pins · 1 missing pins/,
    ),
  ).toBeInTheDocument();
  expect(screen.getByText(/Missing shop pins: missing/)).toBeInTheDocument();
  expect(screen.getByText(/Visibility also depends/)).toBeInTheDocument();
});
it("explains inactive and unassigned states without claiming GPS coverage", () => {
  const { rerender } = render(<AreaReadiness area={area} shops={[]} />);
  expect(screen.getByText(/No shops assigned yet/)).toBeInTheDocument();
  rerender(
    <AreaReadiness
      area={{ ...area, active: false }}
      shops={[shop("pinned", { location: { type: "Point", coordinates: [86, 26] } })]}
    />,
  );
  expect(screen.getByText(/excluded from GPS discovery/)).toBeInTheDocument();
});
it("treats invalid coordinates as missing pins", () => {
  render(
    <AreaReadiness
      area={area}
      shops={[shop("bad", { location: { type: "Point", coordinates: [181, 26] } })]}
    />,
  );
  expect(screen.getByText(/0 with valid map pins · 1 missing pins/)).toBeInTheDocument();
});
