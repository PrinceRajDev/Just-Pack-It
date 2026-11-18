# Buyer Home redesign

Direction: familiar Indian neighbourhood shopping, warm ivory, forest green, vegetable photography and real shop imagery. Spacing, palette, copy, type, layout and navigation follow the unslop craft workflow by Damir Sokolovsky (@heydamir), CC BY 4.0.

Implemented: JustPackIt wordmark/tagline, real notification inbox, dynamic bag count, delivery selector, search, bundled vegetarian produce photograph, category shortcuts/all categories, horizontal API shop cards, per-device/account shop Save preference, purchase-derived Buy Again, five functional navigation tabs, existing products/variant/cart/checkout/account integrations retained.

Photo: Lucas Mendes, [Baskets of vegetables on Unsplash](https://unsplash.com/photos/baskets-of-vegetables--qYeZ6p7i1U). Saved locally as assets/home-vegetables.jpg; no AI generation used.

Data constraints: no invented distance or same-day promise; public shop DTO has no distance. Existing category taxonomy is retained, rather than inventing an Atta category. Voice search requires an additional supported speech integration and is not rendered as an inactive microphone. Shop favourites are device preferences, not server-synced favourites. Buy Again checks currently available listings from recent non-cancelled orders and asks for variant choice where necessary.

Verification: TypeScript, ESLint and Android Metro export passed. Local web preview was started but browser navigation timed out, so no browser screenshot/responsive visual or physical-device verification is claimed. Complete end-to-end checkout and delivery handoff testing remains outstanding.
