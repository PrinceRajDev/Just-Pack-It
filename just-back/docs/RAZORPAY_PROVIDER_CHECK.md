# Razorpay test-provider check — 2026-10-30

Verified configured backend environment without printing credentials: valid test-mode Key ID/secret and webhook secret present; Razorpay enabled; live activation false. No settings were changed.

Actual Razorpay API checks passed: authenticated order-list GET, creation of one explicitly labelled INR 100-paise test order, and fetching the same order with matching receipt/amount/currency. Provider reference: `order_Tu5DyNPHaif7YG`; status `created`. This is an external test gateway object only, not a marketplace/customer order. No MongoDB write, payment attempt, charge, capture, refund or physical fulfilment occurred. The test gateway order remains in the test dashboard; no destructive cleanup was attempted.

This verifies credentials, provider connectivity and server-order API permissions. It does not verify Standard Checkout payment completion, captured payment response, public webhook delivery/signature against dashboard events, actual refund, bank credit or settlement. Those remain pending a test checkout using isolated/staging catalogue fixtures and a configured publicly reachable HTTPS webhook endpoint. Local webhook-secret presence alone does not establish dashboard configuration or delivery.
