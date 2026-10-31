# Seller editing and frontend polish

Existing listings now open `/seller/products/:id/edit` from the product name/actions and inventory screen. Add and Edit share `SellerProductForm`; editing preloads fields, image, optional variants and attributes. Product/shop identity is fixed, existing option IDs are preserved, and new IDs are generated once per new option. Invalid option names/prices/stocks prevent save with a focused accessible error. Optional variants can be added/removed; base inventory is not counted alongside variant stock. Product/stock/overview summaries use variant totals.

Photo chooser supports JPG/PNG/WebP up to 5 MB, preview/replacement/removal, busy and read-error states. This is local demo preview only. All seller edits remain in-memory session changes; reload resets them. API mode refuses form writes until real seller mutations and signed uploads are connected. Buyer catalogue remains separate from the seller preview.

Shared ProductImage now reserves space with loading placeholders, respects reduced-motion transitions, exposes busy/alt/failure states, and recovers when a broken source is replaced. Seller empty listings have a shared empty state and Add action. Form errors are associated with fields; photo chooser shows keyboard focus; mobile variant names span the full row with usable price/stock inputs. No visual identity or routing library replaced.

Changed files:
- `src/components/portal/SellerProductForm.tsx` (shared form extracted from add route)
- `src/routes/seller.products.new.tsx`, `src/routes/seller.products.$id.edit.tsx`, `src/routes/seller.products.tsx`
- `src/routes/seller.inventory.tsx`, `src/routes/seller.index.tsx`, `src/stores/seller.tsx`
- `src/lib/seller-product.ts`, `src/components/store/ProductImage.tsx`, `src/components/common/states.tsx`, `src/styles/workspaces.css`
- `src/routeTree.gen.ts` (generated), `src/test/seller-editing.test.tsx`, `docs/API_CONTRACT.md`

Validation: production build and TypeScript passed; lint 0 errors, 15 existing Fast Refresh warnings. Seven suites / 19 tests passed, including existing listing prefill/save, stable identity, incomplete variant rejection, variant schema validation and image failure/source recovery. Browser verified products → edit → invalid option error → valid variant/price save → reopen with stock 3; other-shop product ID shows not found. Edit at 390px had no root overflow and full-width option name with usable numeric inputs. Session test edits were reset by full navigation and demo sign-in was signed out. Live API/upload persistence and comprehensive screen-reader/manual keyboard auditing remain unverified.
