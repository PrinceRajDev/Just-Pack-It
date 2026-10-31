<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Routing uses TanStack Router file routes (not React Router); portals are layout routes `seller.tsx`, `delivery.tsx`, `admin.tsx` wrapped in `RoleGuard` — UX only, backend must authorise.
- UI never calls `fetch` directly: services in `src/services/*` call `api()` from `src/lib/api/client.ts`, falling back to `src/mocks/*` when `VITE_API_URL` is unset (demo mode), so mocks can be swapped without touching UI.
- Domain types live in `src/domain/types.ts`; client-side prices in `src/lib/pricing.ts` are display estimates only — server re-prices orders.
- All images go through `imageUrl()` in `src/lib/image.ts` so Cloudflare image delivery can be enabled via `VITE_IMAGE_BASE_URL`.
- Never fake payment success or production metrics; demo-only results must be labelled as demo in the UI.
- Expected backend endpoints are documented in `docs/API_CONTRACT.md`.
