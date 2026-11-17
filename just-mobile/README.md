# Just Pack It Mobile

Android-first React Native buyer app built with Expo.

## Start

1. Copy `.env.example` to `.env` and add the deployed backend URL.
2. Run `npm start`.
3. Scan the Expo QR code with Expo Go, or run `npm run android` with a connected Android emulator/device.

## Buyer MVP included

- Delivery-area selection from `/areas`
- Nearby category, shop and product catalogue
- Search and a local bag
- Checkout handoff screen

The app does not claim payment, checkout or delivery success. Those actions must remain server-authoritative when the next checkout and account stage is connected.

## Installable Android APK

Sign in once with an Expo account, then configure the backend URL as an Expo environment variable named `EXPO_PUBLIC_API_URL`. Build an installable test APK with:

```powershell
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

The preview profile creates an `.apk` download link. The production profile creates an Android App Bundle (`.aab`) for Google Play submission.
