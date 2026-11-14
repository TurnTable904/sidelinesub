#!/bin/bash
# usage: ./build.sh <buildNumber> <versionName>
# Wraps app-fragment.html into assets/index.html and builds a signed APK.
# Needs Android SDK platform 34, build-tools 34.0.0, and a JDK.
# The signing keystore is not in git. Point SIDELINE_KEYSTORE at sideline.jks
# and set SIDELINE_KS_PASS and SIDELINE_KEY_PASS in the environment.
set -euo pipefail
B=${1:?build number}
V=${2:?version name}
APP=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$APP/.." && pwd)
SDK=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/opt/android-sdk}}
BT=$SDK/build-tools/34.0.0
PLAT=$SDK/platforms/android-34/android.jar
FRAG=$ROOT/app-fragment.html
KS=${SIDELINE_KEYSTORE:-}
if [[ -z "$KS" && -f "$APP/sideline.jks" ]]; then KS=$APP/sideline.jks; fi
if [[ -z "$KS" || ! -f "$KS" ]]; then echo "Set SIDELINE_KEYSTORE to the signing keystore. Do not commit it." >&2; exit 1; fi
if [[ -z "${SIDELINE_KS_PASS:-}" || -z "${SIDELINE_KEY_PASS:-}" ]]; then echo "Set SIDELINE_KS_PASS and SIDELINE_KEY_PASS. Do not commit them." >&2; exit 1; fi
ALIAS=${SIDELINE_KEY_ALIAS:-sideline}
cd "$APP"
rm -rf out
mkdir -p out/assets out/classes
python3 - "$B" "$FRAG" "$APP/out/assets/index.html" <<'PY'
import sys
B = int(sys.argv[1])
s = open(sys.argv[2]).read().replace('<meta name="claude:viewport-fit-sides" content="cover">', '')
loader = '<script>window.BB_BUILD=%d;</script>' % B
head = (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
    'img{max-width:100%}[hidden]{display:none!important}</style>'
    + loader + '</head><body>'
)
open(sys.argv[3], 'w').write(head + s + '</body></html>')
PY
sed -E "s/versionCode=\"[0-9]+\" android:versionName=\"[^\"]+\"/versionCode=\"$B\" android:versionName=\"$V\"/" AndroidManifest.xml > out/AndroidManifest.xml
"$BT/aapt2" compile --dir res -o out/res.zip
"$BT/aapt2" link -o out/base.apk -I "$PLAT" --manifest out/AndroidManifest.xml -A out/assets --java out/gen out/res.zip
sed "s/__BUILD__/$B/" src/MainActivity.java.tpl > out/MainActivity.java
javac --release 8 -cp "$PLAT" -d out/classes out/gen/com/sidelinesub/team/R.java out/MainActivity.java src/NativeBridge.java
"$BT/d8" --release --min-api 24 --lib "$PLAT" --output out out/classes/com/sidelinesub/team/*.class
cp out/base.apk out/unsigned.apk
(cd out && zip -q unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 out/unsigned.apk out/aligned.apk
"$BT/apksigner" sign --ks "$KS" --ks-key-alias "$ALIAS" --ks-pass env:SIDELINE_KS_PASS --key-pass env:SIDELINE_KEY_PASS --out out/SidelineSub.apk out/aligned.apk
"$BT/apksigner" verify out/SidelineSub.apk
echo "built $B / $V"
ls -la out/SidelineSub.apk
