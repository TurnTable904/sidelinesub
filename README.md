# Sideline Sub
Youth soccer sideline app. Open: https://www.sidelinesub.com/

The site is served at the root of that domain. `CNAME` is `www.sidelinesub.com`.

Before the database rules in this repo go live, follow `MIGRATION.md` in order. Publishing those rules first will stop the current team from syncing.

## Custom domain checklist

These are done in the Firebase, Cloudflare, Google Cloud, and GitHub settings, not in this repo.

1. Firebase console → Authentication → Settings → Authorized domains. Add `www.sidelinesub.com` and `sidelinesub.com`. Leave `turntable904.github.io` until the coach phone has opened https://www.sidelinesub.com/ and entered the coach PIN again.
2. Cloudflare SSL/TLS for this domain must be Full or Full (strict) before GitHub enforces HTTPS. Flexible mode loops once GitHub redirects HTTP to HTTPS.
3. GitHub → Settings → Pages → Enforce HTTPS for `www.sidelinesub.com`. That switch is off. The old project address currently redirects to `http://www.sidelinesub.com/`. After Enforce HTTPS works, turn on Cloudflare "Always Use HTTPS". The bare domain already redirects to www. Its HTTP redirect currently stops at `http://www`, not `https://www`.
4. If anonymous sign-in fails on the new domain and the error mentions the referrer, Google Cloud → APIs & Services → Credentials → the browser key → add `https://www.sidelinesub.com/*` and `https://sidelinesub.com/*`.
5. Add the home-screen icon again from https://www.sidelinesub.com/. An icon installed from the old project address stays tied to that origin.

The shared roster, lineup, score, chat, and saved games live in Firebase and come back when someone enters the team code. A coach enters the PIN again so the new anonymous sign-in is recorded as a coach. Development labels, long-stint thresholds, alert lead, and the saved sign-in live in this browser's `localStorage` and are a different copy on every origin. Nothing uses IndexedDB. The Android app keeps its own copy inside the APK; this domain change does not clear it.

GitHub's redirect runs before the page script, so a bookmark on the old project address cannot hand that `localStorage` to the new domain. The page does hand it over when the script actually runs on the old host (HTTP www, or the bare domain if it serves this file). It copies `sidelinesub.v1`, `sidelinesub.auth.v1`, `sidelinesub.groups.*`, and `ss.hint` only when https://www.sidelinesub.com/ does not already have a saved team.

## Android APK

`app-fragment.html` is the app. `index.html` is that fragment wrapped for GitHub Pages, including `window.BB_BUILD`.

From `apk-project/`, `./build.sh <buildNumber> <versionName>` (for this release, `./build.sh 40 2.20`) writes `out/assets/index.html` and builds `out/SidelineSub.apk`. It needs Android SDK platform 34, build-tools 34.0.0, and a JDK. Point `ANDROID_SDK_ROOT` at the SDK.

The signing keystore stays out of git. Set `SIDELINE_KEYSTORE` to that file, and set `SIDELINE_KS_PASS` and `SIDELINE_KEY_PASS` in the environment. An APK signed with a different key will not install over the existing app. Do not commit the keystore or those passwords.
