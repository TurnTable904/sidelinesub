# Lock the Sideline Sub database

The app change and the database rules are separate steps. The live team keeps working on today's open rules until you publish the new rules. Publish the rules last. This environment cannot sign in to your Firebase project, so it cannot enable Anonymous auth or deploy the rules for you.

Build 38, 39, and 40 already sign in and already follow `database.rules.json`. Do not publish those rules until the coach phone is on one of those builds and has finished steps 4 and 5. Until you publish, those phones keep syncing on the open database, including in the middle of the season. After you publish, those same builds keep working. An older app that does not send a sign-in token cannot write after that.

Do the steps in order, in one sitting, and not during a game.

## 1. Ship the new website first

Merge the pull request. Do not change Firebase rules yet.

Wait until https://turntable904.github.io/sidelinesub/ is the new copy. View source and look for `BB_BUILD=40`, or open the app and check Settings for Version 40. GitHub Pages can serve the previous file for about 10 minutes.

Until step 8, the database is still open. Build 38 and 39 keep syncing on it. Do not publish rules during a game.

## 2. Turn on Anonymous sign-in

Firebase console → the project that owns `bridge-blue-default-rtdb` → Build → Authentication → Sign-in method → Anonymous → Enable → Save.

## 3. Confirm the web API key is already in the live app

The public web API key is already in the app source. It is a client id, not a password. Do not copy it into chat, email, or a pull request.

Project settings (gear) → General → Your apps. Confirm `databaseURL` is `https://bridge-blue-default-rtdb.firebaseio.com`. If the project id is not `bridge-blue`, remember that for step 8.

Wait until the live site source still shows that key and shows `BB_BUILD=40`.

Do not put a coach PIN, a PIN hash, or a sign-in id in git.

## 4. Sign in on the coach phone

On the phone that already has the team, open the site in the same browser as usual (so the saved team is still there). Not during a game.

Settings should show `Sign-in id:` and a long id. Leave that page open.

If it says sign-in is not configured, the live page does not have the API key yet. If it stays on "Signing in…", Anonymous auth is not enabled or the key is from a different project.

## 5. Set a new coach PIN

Settings → Edit team / coach PIN → enter a new 4 to 6 digit PIN → Save.

Wait until the header says synced, not "not synced". Until step 8, do not change the lineup from the old Android app. That copy can write the old PIN back over this save.

This does three things:

- Stores a SHA-256 of `sidelinesub:v2:` plus the PIN at `teamSecrets/<team code>/pinHash`. Clients are not allowed to read that path.
- Records this phone's sign-in id as a coach.
- Saves the team again without the old readable PIN and without development labels.

The old 32-bit PIN hash cannot be reused. Parents keep using the team code with no PIN.

## 6. Check the data once

Realtime Database → Data. Look only. Do not copy the hash into chat, email, or git.

- `teamSecrets/<team code>/pinHash` exists
- `teamSecrets/<team code>/ownerUid` exists
- `teams/<team code>/coaches/<sign-in id>` is `true`
- `teams/<team code>/state/state/team` has `pinV` equal to `2` and no `pin`
- players under `teams/<team code>/state/state/roster` have no `group`

Development labels stay in this browser only. Clearing site data on the coach phone drops them. Player names stay on the team record.

## 7. Try the coach phone once more

Reload the site. The lineup should still load and the header should sync. Leave the rules alone if this fails, and use the recovery section only after you are sure the rules were not published.

## 8. Publish the rules

Do this only after step 7 succeeds. This is the step that locks the database. Nobody should publish these rules from a pull request or from the agent that wrote them.

After it, a request with no sign-in cannot read or write a team, and nobody can list `/teams`. A parent signed in anonymously can read that team and post their own chat. Only a sign-in id listed under `teams/<team code>/coaches` can write the lineup, roster, score, and game history. A phone becomes a coach by proving the PIN: it writes a claim whose hash matches the stored PIN hash, then sets its own `coaches/<sign-in id>` entry. Parents do not need the PIN. `/app` cannot be read or written.

Build 38 and 39 already do those writes. Publishing does not require them to update again.

Either:

- Realtime Database → Rules → select all → paste the entire `database.rules.json` from this repo → Publish

or, on your own machine, after `firebase login`:

```bash
firebase use bridge-blue
firebase deploy --only database
```

`firebase use` must be the project that contains `bridge-blue-default-rtdb`. If that project id is different, select it in the console and paste the rules there instead of deploying with the CLI. `.firebaserc` in this repo assumes `bridge-blue`.

Nobody has published these rules from the agent that wrote them.

## 9. Confirm access

- Reload the coach site. Sync should still succeed.
- In a second browser, Join a team → parent / viewer → team code, no PIN. You should see the game and chat, and not the coach buttons.
- On that second browser, switch to Coach and enter the new PIN. The wrong PIN should fail. The right PIN should sync.

The team code is still what parents type to read that team. It is no longer a way to list every team or to change the lineup.

## 10. Android copies

An APK from before build 38 does not send a sign-in token. After step 8 it will stop syncing. Build 38 and 39 APKs keep syncing. Use the website, or build a new APK and give people that file. There is no in-app HTML update anymore.

Sub reminders on a locked phone need the build 40 APK, because the website cannot post an Android notification by itself. From `apk-project/`, with the signing keystore only in the environment:

```bash
./build.sh 40 2.20
```

The page calls `window.SidelineAndroid.notify(title, body)`, `vibrate(ms)`, `startGameService(dueAtMs, leadMs)`, and `stopGameService()`. `dueAtMs` is an absolute timestamp. The service waits until that time. It does not tick the game clock.

## If you publish the rules too early

Console edits ignore the rules, because you are the project owner. On the coach phone, Settings shows the sign-in id once step 3 and 4 worked.

In Realtime Database → Data, set:

- `teams/<team code>/coaches/<sign-in id>` = `true` (boolean)
- `teamSecrets/<team code>/ownerUid` = that same sign-in id (string)

On your computer, hash the new PIN (replace the digits; do not commit the command with a real PIN):

```bash
printf '%s' 'sidelinesub:v2:123456' | sha256sum
```

Set `teamSecrets/<team code>/pinHash` to the 64-character hex value (string), with no extra spaces.

Reload the site and set the same PIN again under Edit team.

## What the new website changes before you touch Firebase

- New teams and Reset roster use Player 1, Player 2, and so on. The existing team roster is left as it is.
- Development labels are saved on the coach phone and are left out of the shared team record on the next coach save.
- The app no longer installs HTML pulled from `/app`.
