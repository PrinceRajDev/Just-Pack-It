# Role authentication flows

All roles use the same phone/password login. The server-issued session role controls routing; role labels and return URLs never assign permissions.

| Role | Registration | Default signed-in destination |
| --- | --- | --- |
| Buyer | Public buyer signup; email proof when required by server | `/account` |
| Seller | Public seller signup, shop details, optional photo; existing admin approval still required | `/seller` |
| Delivery partner | Existing platform-provisioned account; no public privileged signup | `/delivery` |
| Admin | Existing operator-provisioned account; no public privileged signup | `/admin` |

Fixes:
- Valid return paths preserve query/hash; other-role workspaces and unsafe/external/login-loop destinations fall back to the signed-in role home.
- Wrong-account switching awaits logout; a failed logout stays on the current screen and allows retry. Repeated switching is locked.
- Login recognizes an existing session and offers Continue or Use a different account. Session hydration shows a status before exposing forms.
- Authentication submit locks prevent duplicate requests; errors retain credentials and focus the error summary.
- Password recovery updates the page heading and returns to normal sign-in after completion/back.
- Existing email proof gating, buyer/seller-only signup, pending seller approval and photo-upload failure handling remain intact.

No new delivery/admin self-registration endpoints, account-role changes or verification bypasses were added. Real email delivery remains dependent on sender configuration. Automated role-result tests use mocked server sessions; these do not establish real provider/email delivery or every privileged workspace's end-to-end behaviour.
