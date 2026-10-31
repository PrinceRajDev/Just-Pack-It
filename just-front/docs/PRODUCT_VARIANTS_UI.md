# Product variant selection

Product options now use reusable, keyboard-accessible radio cards styled as selection buttons. Each card represents an actual variant ID and displays its label, optional typed attributes (size/colour/weight or any category-specific fields), price and stock. No combinations are inferred from product names or generated from a Cartesian product. Unavailable options remain visible and disabled.

Selected label, price, availability and Add/quantity controls update together; price/stock announcements use a polite live region. Variant choice is scoped to the product ID so route navigation cannot reuse another product's choice. Cart lines remain keyed by product and variant. Unknown or missing required variants cannot fall back to parent inventory when adding. Existing non-variant products retain their Add flow.

Changed files: `src/components/store/VariantPicker.tsx`, `src/components/store/QtyStepper.tsx`, `src/routes/product.$id.tsx`, `src/stores/cart.tsx`, `src/test/variant-selection.test.tsx`.

Validation: build, TypeScript and lint passed (0 errors; 15 existing Fast Refresh warnings). Five suites / 11 tests passed, including real CartProvider interactions with isolated test-only size/colour fixtures: switching options changes price, quantities remain independent, each option stops at its own stock, unavailable options are disabled and unknown variant IDs are rejected. Browser verified the existing demo bread options, stock limit 6 and correct ₹180/500 g cart line; temporary cart items removed. At 390px no root horizontal overflow was found.

Backend dependencies remain unchanged: actual category-specific variant attributes, current prices and inventory must come from the catalogue; the server must validate ownership and reserve stock/reprice checkout. The existing browser cart's catalogue lookup still uses demo data, so live catalogue/cart integration remains a separate backend dependency. No new catalogue products or stock values were fabricated for this UI change.
