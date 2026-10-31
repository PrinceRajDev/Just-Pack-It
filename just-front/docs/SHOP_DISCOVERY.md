# Category shop discovery

Category pages now combine shop/locality search, Open now, pickup/any delivery/shop delivery/platform rider filters, and name or listed delivery-fee sorting. Filters persist in the route URL; existing `sort=open` links still work. Clear filters restores the category's area-eligible results and is available in empty results. Result counts announce changes to assistive technology.

Fee sorting uses only finite nonnegative delivery fees actually supplied for delivery-capable shops. Missing fees always sort last; cards show “Delivery fee not listed” instead of assuming free delivery. This is not cross-shop product price comparison. Final address/method fees and live availability require backend validation. No shops, fees or ratings were fabricated.

Changed files:
- `src/routes/category.$slug.tsx`
- `src/lib/shop-discovery.ts`
- `src/test/shop-discovery.test.ts`
- `docs/API_CONTRACT.md`

Checks: build, TypeScript and lint passed (0 errors, 15 existing Fast Refresh warnings); 4 test suites / 9 tests passed. Browser checks verified pickup filtering (Sharma only), combined search/open/pickup empty results, clearing all filters, known fee before missing fee in descending order, and exclusion of the closed bakery under Open now. Mobile at 390px had no root horizontal overflow. API-side filtering before pagination remains documented as a backend dependency.
