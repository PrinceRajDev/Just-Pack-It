# Browse reference implementation

Only the Browse screen is replaced. The app keeps its existing state navigation, authentication, bag, Product Details and Shop Details. The shared header is omitted on Browse to match the supplied 390 × 844 reference; Home still renders its own existing header.

Six photographic category cards, heading, search, three pills and nearby-shops promo follow the reference. `browse-figma-artwork.png` contains the user-supplied artwork. Only the six photos are clipped from it; text and controls are native components. The existing five-tab navigation is reused. No example shops or brands are shipped as records.

Category mappings use existing IDs/slugs: Vegetables → fruits-vegetables, Atta/Grains → grocery-kirana, Fashion → fashion, Dairy → dairy-eggs, Home/Living → kitchen-home-goods, Snacks → fast-food-snacks. Labels are discovery shortcuts into the current taxonomy, not new database categories. Selecting a card loads the matching category API and supports query/paging/retry/empty states.

Shops use the existing search API and open existing Shop Details. Product results reuse ProductCard, including variants, details and stock-limited Add. Search preserves product/shop pagination. The backend has no standalone brands endpoint. Brands are derived exclusively from real product brand attributes across the paginated area inventory, and brand search merges matching products. Current public inventory has no brand attributes, so the Brands tab shows an explicit empty state.

Visual QA: Expo web at 390 × 844 with test-only 44px top/20px bottom native-safe-area simulation. Fresh screenshot `qa/browse-reference/browse-390.png` was compared against the reference and spacing corrected. 360/430px widths were also checked. `scripts/check-browse-reference.cjs` uses public API snapshots through a local CORS relay; app backend configuration is unchanged. It checks category results, tabs, promo, shop opening, real product search, no-result search, all bottom tabs and browser runtime errors. Account navigation does not submit login. Existing Home regression also passes. Physical-device checkout and positive live-brand data are not claimed.
