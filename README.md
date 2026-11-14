# Sideline Sub
Youth soccer sideline app. Open: https://turntable904.github.io/sidelinesub/

Before the database rules in this repo go live, follow `MIGRATION.md` in order. Publishing those rules first will stop the current team from syncing.

## Android APK

`app-fragment.html` is the app. `index.html` is that fragment wrapped for GitHub Pages, including `window.BB_BUILD`.

From `apk-project/`, `./build.sh <buildNumber> <versionName>` (for this release, `./build.sh 38 2.18`) writes `out/assets/index.html` and builds `out/SidelineSub.apk`. It needs Android SDK platform 34, build-tools 34.0.0, and a JDK. Point `ANDROID_SDK_ROOT` at the SDK.

The signing keystore stays out of git. Set `SIDELINE_KEYSTORE` to that file, and set `SIDELINE_KS_PASS` and `SIDELINE_KEY_PASS` in the environment. An APK signed with a different key will not install over the existing app. Do not commit the keystore or those passwords.
