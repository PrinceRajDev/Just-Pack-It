# Mobile shopping improvements

- Product pages have a mobile-only fixed purchase bar, with selected option label, price, available quantity and the existing Add/quantity controls. Before selection, Choose options scrolls to the picker and focuses an available radio. Reduced-motion preferences are respected. Desktop keeps its inline control; mobile hides that duplicate.
- Bar spacing accounts for bottom safe areas; main/footer content has space to remain reachable. Cart's existing mobile checkout bar also receives safe-area spacing and wrapping.
- Cart now opens with linked shop-wise estimated totals, delivery fees and closed state. Each shop section shows items subtotal separately from total including delivery. Links jump to shop sections with sticky-header clearance. Removal controls and quantity rows wrap on narrow screens.
- Existing price estimation, checkout blocking and shop grouping are preserved. No new API or payment behavior; live quotes, stock and serviceability still require the backend.

Changed files: `src/components/store/MobileProductPurchase.tsx`, `src/routes/product.$id.tsx`, `src/routes/cart.tsx`, `src/styles/workspaces.css`.

Checks: build and TypeScript passed; lint 0 errors / 15 existing warnings; 5 suites / 11 existing tests passed. Browser at 390px verified picker focus from the bottom bar, selection/add/quantity sync, bottom edge alignment and no product overflow. Two-shop cart showed ₹205 and ₹63 estimates (₹268 combined), correct variant and shop links, and blocked checkout for the closed bakery. A 320px check exposed narrow bar wrapping; wrapping was added. One-shop cart at 320px had no overflowing elements. Demo test items were removed; no order placed.
