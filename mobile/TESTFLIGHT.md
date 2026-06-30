# TestFlight Release

The mobile app is versioned from `mobile/app.json`. The initial TestFlight release uses:

- App version: `0.1.0`
- iOS build number: `1`
- iOS bundle identifier: `language-vault-ios`

The bundle identifier matches `mobile/GoogleService-Info.plist`. If the Apple bundle identifier changes, create a matching iOS app in Firebase and replace the plist before building.

## Build

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build --platform ios --profile production
```

## Submit

```bash
cd mobile
npx eas-cli@latest submit --platform ios --latest --profile production
```

After App Store Connect finishes processing the build, add internal or external testers from the TestFlight tab. External testers require Apple beta review before they can install the build.
