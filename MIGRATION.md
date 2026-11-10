# Lock the Sideline Sub database

The app change and the database rules are separate steps. The live team keeps working on today's open rules until you publish the new rules. Publish the rules last. This environment cannot sign in to your Firebase project, so it cannot enable Anonymous auth or deploy the rules for you.

Do the steps in order, in one sitting, and not during a game.

## 1. Ship the new website first

Merge the pull request. Do not change Firebase rules yet.

Wait until https://turntable904.github.io/sidelinesub/ is the new copy. View source and look for `BB_BUILD=35`, or open the app and check Settings for Version 35. GitHub Pages can serve the previous file for about 10 minutes.

Until step 8, the database is still open. The new page talks to it the same way as before when no web API key is set, so the current team still syncs, including the old Android app.

## 2. Turn on Anonymous sign-in

Firebase console → the project that owns `bridge-blue-default-rtdb` → Build → Authentication → Sign-in method → Anonymous → Enable → Save.

## 3. Put the web API key in the app

Project settings (gear) → General → Your apps → Add app → Web (`</>`).

You do not need Hosting. Copy `apiKey` from the config it shows. Confirm `databaseURL` is `https://bridge-blue-default-rtdb.firebaseio.com`. If the project id is not `bridge-blue`, remember that for step 8.

Edit this line in `index.html`:

```js
const FIREBASE_API_KEY='';
```

Paste the key between the quotes. The key is a public client id, not a password. Commit and push.

Do not put a coach PIN, a PIN hash, or a sign-in id in git.

Wait until the live site source shows that key and still shows `BB_BUILD=35`.

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

This is the step that locks the database. After it, a request with no sign-in cannot read or write a team, nobody can list `/teams`, and only coach sign-in ids can write the lineup, roster, score, and game history. `/app` cannot be read or written.

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

The old APK does not send a sign-in token and it cannot install this version by itself. After step 8 it will stop syncing. Use the website, or build a new APK from this `index.html` and give people that file. There is no in-app HTML update anymore.

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
