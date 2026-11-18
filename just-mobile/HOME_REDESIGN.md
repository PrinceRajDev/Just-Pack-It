# Buyer Home — Figma correction (18 November)

The supplied 390 × 1658 screenshot is now the visual reference. This pass replaces the previous interpretations below with its section order, 220px hero, 4 × 2 categories, two-column shop/product cards, sage Buy Again and five-tab navigation.

`assets/home-figma-artwork.png` is the user-supplied reference. `ReferenceArtwork` displays only its logo mark, location icon, market photo and seven category photos as clipped artwork. All text, buttons, navigation, shop/product listings and prices remain live React Native components. Reference example inventory is never shown as real inventory.

Root cause: `picked` lived in App state while Home/back handlers changed only `screen`, preserving an old category. Home entry now resets category/query/shop/scroll. Intentional filtering keeps its API request, paging and retry. The public Raiyam API returns two products in pet-supplies and stationery-books; an unrelated selected category correctly returns zero. Default Home now restores both products.

Header/search scroll with Home; bottom tabs stay outside the scroll. The old 156px bottom gap is removed. Native storage remains encrypted SecureStore, with tab-scoped browser storage for web QA.

Fresh screenshots in ignored `qa/home-reference/` were inspected at 390px and 1658px height, plus 360/430px. This exposed a narrow-screen photo crop gap, fixed with cover scaling. The QA runner relays fresh public API snapshots because the native API rejects the local browser origin through CORS; production API settings are unchanged. It checks default state, deliberate filtering, Home reset, restored products, More, Explore shops, location selection, horizontal overflow and runtime errors. TypeScript, ESLint and Android export were also run. Physical-device and full checkout QA are not claimed.

Live names, city, prices, photos, stock and open/closed states differ from the reference examples. Rating/distance are shown only when supplied. One product has an HTML sharing URL instead of an image and uses the existing fallback. Logged-out Buy Again retains the sage panel with sign-in. No fake status bar or inactive microphone was added; voice search needs a supported native speech integration.

## Previous implementation notes (superseded)

Direction: familiar Indian neighbourhood shopping, warm ivory, forest green, vegetable photography and real shop imagery. Spacing, palette, copy, type, layout and navigation follow the unslop craft workflow by Damir Sokolovsky (@heydamir), CC BY 4.0.

Implemented: JustPackIt wordmark/tagline, real notification inbox, dynamic bag count, delivery selector, search, bundled vegetarian produce photograph, category shortcuts/all categories, horizontal API shop cards, per-device/account shop Save preference, purchase-derived Buy Again, five functional navigation tabs, existing products/variant/cart/checkout/account integrations retained.

Original photo: Lucas Mendes, [Baskets of vegetables on Unsplash](https://unsplash.com/photos/baskets-of-vegetables--qYeZ6p7i1U).

Reference matching pass: built-in imagegen generated `assets/home-vegetables-reference.png` from the user reference: bright wicker basket of tomatoes, carrots, yellow pepper, broccoli, cauliflower, purple cabbage and lettuce, blurred Indian produce shop, no text or meat. It also generated transparent `assets/buy-again-reference.png`: grouped rice sack, bananas and milk bottle, no text. Both assets are bundled locally. Banner typography, six shortcut layout and Buy Again composition were adjusted against the reference. Grains shortcut opens actual "atta" search rather than inventing a backend category.

Data constraints: no invented distance or same-day promise; public shop DTO has no distance. Existing category taxonomy is retained, rather than inventing an Atta category. Voice search requires an additional supported speech integration and is not rendered as an inactive microphone. Shop favourites are device preferences, not server-synced favourites. Buy Again checks currently available listings from recent non-cancelled orders and asks for variant choice where necessary.

Verification: TypeScript, ESLint and Android Metro export passed. Local web preview was started but browser navigation timed out, so no browser screenshot/responsive visual or physical-device verification is claimed. Complete end-to-end checkout and delivery handoff testing remains outstanding.
