# Location-first browsing

- Discovery now asks for an active area before displaying shops/products; category navigation remains available. Empty recommendation shelves are hidden until selection.
- Selection updates homepage shops and their recommendations, category shop lists/counts, search shops/products and header suggestions. Query keys include area IDs. Existing carts and direct detail links remain intact.
- Active selection is restored from browser storage; deleted/inactive IDs are ignored. Storage failures retain an in-memory selection. Picker has loading, retry and no-area states and closes after selection. Coming-soon areas cannot be selected.
- All five existing demo shops explicitly serve `z1`; `z2` stays inactive. This is sample configuration, not a real serviceability claim. See API_CONTRACT.md for the proposed public area service and server filtering requirements.

Changed files: `src/domain/types.ts`, `src/mocks/data.ts`, `src/services/catalog.ts`, `src/stores/location.tsx`, `src/components/store/{AreaNotice.tsx,useAreaShops.ts,StoreLayout.tsx,StoreHeader.tsx,ProductBrowser.tsx}`, `src/routes/{index.tsx,categories.tsx,category.$slug.tsx,search.tsx}`, `src/test/location-catalog.test.tsx`, `docs/API_CONTRACT.md`.

Validation: build and TypeScript passed; lint has 0 errors and 15 existing Fast Refresh warnings. Tests: 3 suites/6 tests passed outside the Windows sandbox (sandbox temp-cache rename failed before tests). New tests verify explicit area assignments, unknown/unserved area exclusion, product/shop ownership filtering and separate cache keys. Browser verified initial choose-area prompt with hidden listings, disabled coming-soon area, selection closing picker and revealing five shops, and area persistence across a full category navigation with two eligible grocery shops. No root overflow in the checked desktop category view. Live backend filtering, address serviceability and payment behavior were not tested.
