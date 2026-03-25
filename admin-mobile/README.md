# PakNutrition Admin Mobile

React Native + Expo admin app for PakNutrition. This app talks to the same Django admin APIs as the web admin panel, so mobile and web changes stay in sync.

## Setup

1. Copy `.env.example` to `.env`
2. Set `EXPO_PUBLIC_API_BASE_URL` to your backend API URL
3. Set `EXPO_PUBLIC_EAS_PROJECT_ID` to your Expo project ID so push notifications work in preview/production builds
4. Optionally set `EXPO_PUBLIC_EXPO_OWNER` if the app belongs to an Expo account or org
5. For Android push, place `google-services.json` in the project root or point `GOOGLE_SERVICES_JSON` to it
6. Run `npm install`
7. Start with `npm run start`

## Verification

- `npm run typecheck`
- `npm run export:web`
- `npm run verify`

## Release

1. Confirm `.env` points to the production API and Expo project
2. Log in to Expo on the machine that will build the binaries
3. Preview build:
   `eas build --profile preview --platform android`
   `eas build --profile preview --platform ios`
4. Production build:
   `eas build --profile production --platform android`
   `eas build --profile production --platform ios`
5. Submit when the builds look correct:
   `eas submit --profile production --platform android`
   `eas submit --profile production --platform ios`

## Notes

- Push notifications use Expo push tokens registered against the Django backend.
- Android push builds also need `google-services.json` from Firebase, and EAS must have the FCM V1 server key configured.
- iPhone push builds need Apple push credentials/TestFlight setup on EAS.
- For remote push notifications on SDK 55, use a development build or production build rather than Expo Go.
- Mobile CRUD actions update the same backend data used by the existing web admin panel.
- The mobile app now includes a dedicated analytics screen in addition to dashboard, orders, catalog, customers, payments, reports, and storefront settings.
- Runtime errors are caught by an app-level error boundary and API errors are normalized into clearer mobile-friendly messages.
