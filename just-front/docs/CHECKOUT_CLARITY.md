# Checkout clarity

Cart, checkout details and final review display each shop's item subtotal, estimated delivery/pickup fee, optional item minimum and shop total. Unknown minimum is labelled Not provided; explicit zero means No minimum. Existing sample shops were not assigned fabricated minimums. Known minimums compare only that shop's item subtotal, excluding delivery.

Shared readiness checks expose actionable alerts and block cart checkout, review progression and submission for closed/deleted shops, missing products, invalid quantities, unavailable or excessive stock, missing/deleted required variants and unmet known minimums. Invalid lines omitted from priced groups still remain removable from cart and block checkout; they are not silently discarded. Closed-shop copy shows supplied hours instead of guessing the next opening time. These are browser UX checks, not backend enforcement.

Files: `src/domain/types.ts`, `src/lib/bag-readiness.ts`, `src/components/store/BagSummary.tsx`, `src/routes/cart.tsx`, `src/routes/checkout.tsx`, `src/test/bag-readiness.test.ts`, `docs/API_CONTRACT.md`.

Validation: build and TypeScript passed; lint 0 errors / 15 existing Fast Refresh warnings; 6 suites / 15 tests passed. Four new tests cover stock/quantity, closed shops, variant ownership, per-shop minimums (no cross-shop contribution), and missing records. Browser verified the cart/checkout path, per-shop ₹38 item + ₹25 delivery = ₹63 breakdown and unknown minimum in both checkout steps; 390px checkout had no root overflow. No order or payment submitted; temporary demo cart cleared. Backend must provide minimum rules, live availability and address/method quotes, and revalidate checkout atomically.
