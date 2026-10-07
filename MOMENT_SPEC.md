# Moment -- Build Spec v1.0

Reader: Claude Code. Terse by design. Keywords MUST / SHOULD / MAY per RFC 2119.

---

## 0. How to use this spec

- Build in milestone order (§20). Each milestone ends with its acceptance criteria passing.
- Where the spec is silent: choose the simplest option consistent with §2 Principles, then add a new entry to `DESIGN_DECISIONS.md`.
- Every visual or behavioral choice in code carries a comment with its DD id, e.g. `/* DD-014 */`.
- Seed `DESIGN_DECISIONS.md` from Appendix A. Keep it current.
- MUST NOT add: frontend frameworks, build steps, analytics, trackers, third-party fonts, third-party runtime scripts, CDNs.

---

## 1. Product

- Name: **Moment**.
- What it is: an installable PWA that helps one person get through a hard moment or a hard day with meth cravings.
- Methods:
  - Delay–Distract–Decide (DDD): primary structure.
  - Urge surfing (from mindfulness-based relapse prevention).
  - CBT tools: stimulus control, play the tape forward, permission-thought challenge, coping statements, if-then plans, behavioral activation.
  - Shadow work: stub only (one optional question).
- Scope: the moment and the day.
- Non-goals:
  - relapse tracking, sobriety counters, treatment planning
  - diagnosis, clinical claims
  - social features, accounts, logins
  - gamification
- Users: single owner at launch. Architecture MUST support many independent anonymous identities so it can ship publicly later.
- Platforms:
  - Primary: iOS Safari home-screen PWA (iOS 16.4+).
  - MUST also work in current desktop Chrome, Safari, Firefox, and Android Chrome.
- Language: English. All strings centralized for later i18n.

---

## 2. Principles

| ID | Principle | Rule |
|---|---|---|
| P1 | Speed | Cold open to moment started in ≤2 taps and ≤2 s. Works fully offline. |
| P2 | Low load in crisis | One question per screen. No typing required. Nothing mandatory. Visible exit on every screen. |
| P3 | No cues | No drug words or imagery in app-authored content or notifications. Exceptions: the After-using screen (§6.5) and user-authored text. |
| P4 | No pressure mechanics | No streaks, day counts, scores, badges, app badges, confetti, or reset-to-zero numbers. The only counter is cumulative and never resets. |
| P5 | Own evidence first | Prefer the user's own data over generic claims. Generic claims stay conservative. |
| P6 | Calm, then useful | Engagement comes from usefulness and calm. Never from urgency or guilt. |
| P7 | Consent to contact | The app never notifies unless the user asked for check-ins after a moment. |
| P8 | Plain and nonjudgmental | Factual language. No praise words, no shame words, no clinical labels. |
| P9 | Private by design | Local-first. Server stores only ciphertext plus check-in times. |
| P10 | Overridable design | All visuals are tokens. All copy lives in one strings file. All choices are documented as DD entries. |

---

## 3. Architecture

```
iPhone (home-screen PWA)
 ├─ static app (GitHub Pages)
 ├─ IndexedDB (source of truth)
 ├─ Service Worker (offline shell, push display)
 └─ HTTPS → Cloudflare Worker (/v1)
              ├─ D1 (ciphertext records, push subs, check-in times)
              └─ Cron trigger every minute → Web Push (VAPID) → Apple / FCM / Mozilla push services
```

### 3.1 Frontend

- Static HTML/CSS/JS. Native ES modules. No build step. No runtime npm deps.
- JSDoc types on all modules.
- Hash router (`#/home`), because GitHub Pages has no SPA fallback.
- All asset URLs relative, since a Pages project site serves under `/<repo>/`.
  - Manifest `start_url: "./#/home"`, `scope: "./"`.
- Config in `web/js/config.js`:
  - `API_BASE`
  - `VAPID_PUBLIC_KEY`
  - `FLAGS` (§18)
  - `APP_VERSION`

### 3.2 Backend

- Cloudflare Workers Free plan, D1 database, one cron trigger `* * * * *`.
- Free-plan limits to design within:
  - 100k requests/day
  - 10 ms CPU per invocation
  - 50 subrequests per invocation
  - 5 cron triggers per account
- Secrets (via `wrangler secret`):
  - `VAPID_PRIVATE_JWK`
  - `VAPID_SUBJECT` (`mailto:`)
- Vars:
  - `ALLOWED_ORIGIN` (the Pages origin)
- Web Push implemented with WebCrypto only (RFC 8291 aes128gcm + RFC 8292 VAPID ES256).
  - A small npm lib MAY be used in the Worker only if it is WebCrypto-based with no Node built-ins.
  - Wrangler bundles the Worker.

### 3.3 Repo layout

```
/web                      # deployed to GitHub Pages
  index.html
  manifest.webmanifest
  sw.js
  /icons                  # 180 apple-touch, 192, 512, 512 maskable
  /css
    tokens.css            # all design tokens (§13)
    base.css              # reset, typography, layout primitives
    components.css        # buttons, chips, slider, cards, sheets
  /js
    app.js                # boot, router, install gate, SW registration
    config.js
    strings.js            # every user-facing string
    router.js
    db.js                 # IndexedDB wrapper + migrations
    state.js              # active moment state, event bus
    /lib                  # pure, testable, no DOM
      metrics.js          # §10
      schedule.js         # §7 check-in plan generation
      crypto.js           # HKDF, AES-GCM, base64url
      sync.js             # §9
      time.js             # tz, quiet hours, DST-safe local times
    /ui
      wave.js             # canvas wave + plotted ratings (§14)
      slider.js           # 0–10 intensity control
      chips.js, sheet.js, chart.js
    /screens              # one module per screen (§6)
    /services
      guidance.js         # text guidance now; audio stub (§18)
      feedback.js         # haptics stub, no-op (§18)
      push.js             # permission + subscription
      api.js              # Worker client
      support.js          # human-support stub (§18)
    /content
      defaults.js         # prefilled lists (§11)
      learn.js            # Learn cards (§6.10)
/worker
  wrangler.toml
  schema.sql
  /src
    index.js              # router, CORS, auth
    sync.js, devices.js, checkins.js, push.js, webpush.js
/test                     # node --test
  metrics.test.js, schedule.test.js, sync.test.js, crypto.test.js, worker.test.js
/.github/workflows
  pages.yml               # deploy /web to Pages
  worker.yml              # optional: wrangler deploy (CLOUDFLARE_API_TOKEN)
DESIGN_DECISIONS.md
README.md                 # setup: VAPID key gen, D1 create, secrets, deploy, iOS install
```

---

## 4. Identity, auth, encryption

- First launch:
  - Generate `deviceId` (UUIDv4) and `secret` (32 random bytes).
  - Store both in IDB `meta`.
- Derive with HKDF-SHA256 (WebCrypto), salt `"moment"`:
  - `authToken` = 32 bytes, info `"auth-v1"`, base64url.
  - `encKey` = AES-GCM-256, info `"enc-v1"`, non-extractable.
- Register:
  - `POST /v1/devices {deviceId, authToken}`.
  - Server stores SHA-256(authToken).
  - Idempotent.
- Auth header: `Authorization: Bearer <deviceId>.<authToken>`.
  - Server hashes the token and compares in constant time.
- Sync records:
  - JSON → AES-GCM with a random 12-byte IV → `{iv, ct}` in base64url.
  - Server never sees plaintext.
  - Plaintext on the server is limited to: store name, record id, updatedAt, deleted flag, and check-in `dueAt` + `kind`.
- Restore link:
  - Format: `<appUrl>#/restore/<deviceId>.<secretB64url>`.
  - Lives in the URL fragment only, so it never reaches the server or Pages logs.
  - Shown in Settings with the warning: "Anyone with this link can read your data. Keep it private."
- Lost secret means lost server data. Settings states this plainly.
- Export (§6.11) never includes the secret.

---

## 5. Data model

### 5.1 Common fields (all synced records)

`id` (uuid), `createdAt`, `updatedAt` (epoch ms), `deleted` (bool), `v` (schema version int).

### 5.2 IndexedDB `moment-db` v1 stores

| Store | Key | Synced | Contents |
|---|---|---|---|
| `meta` | key | no | `deviceId`, `secret`, `registeredAt`, `syncCursor`, `pushEndpoint`, `installDismissedAt`, `lastSetupCardDate`, `notifExplainedAt`, `schemaVersion` |
| `settings` | `"settings"` | yes | see below |
| `profile` | `"profile"` | yes | `reasons: string[]` (≤7, ≤120 chars each), `messageToSelf: string` (≤400), `ifThenPlans: [{id, triggerTagId, thenText, distractOptionId?}]` (≤6) |
| `distractOptions` | id | yes | `{label, category: body\|place\|hands\|mind, effort: low\|medium, hidden, order, builtIn}` |
| `triggerTags` | id | yes | `{label, group: halt\|context, hidden, order, builtIn}` |
| `permissionThoughts` | id | yes | `{thought, counter, hidden, order, builtIn}` |
| `moments` | id | yes | §5.3 |
| `checkins` | id | yes | `{momentId?, dueAt, kind: plus10\|plus30\|plus2h\|evening\|morning\|again30, status: pending\|sent\|answered\|cancelled\|expired, answer?: okay\|rough\|start\|later\|stop, answeredAt?}` |
| `syncQueue` | auto | no | `{store, id, queuedAt}` |

`settings` defaults:

```
checkinsEnabled: true
quietStart: "00:00"
quietEnd: "07:00"
eveningTime: "20:00"
morningTime: "09:00"
delayMinutes: 15            // options 5, 10, 15, 20
ratingPromptSec: 120
reducedMotion: "system"     // system | on | off
shadowPrompt: true
```

### 5.3 Moment record

```
startedAt, endedAt|null, lastInteractionAt
status: active | closed | unfinished
previousMomentId|null
delayTargetMin
ratings: [{t /*ms since start*/, v /*0–10*/, src: initial|prompt|manual|return|close}]
distance: done | skipped | null
bodyLocations: [head|jaw|throat|chest|stomach|hands|legs|whole|unsure]
sensations: [tight|hot|buzzing|restless|heavy|hollow|racing|other]
triggerTagIds: []
steps: [{step: distance|surf|distract|decide|close, at}]
distractUses: [{optionId, startedAt, returnedAt|null, ratingBefore|null, ratingAfter|null}]
decide: {tapeViewed: bool, tapeNotes: string[]|null, thoughtIds: [], wordsViewed: bool, plansShown: []}
outcome: passed | quieter | strong | used | stopped | private | null
seeking: relief | energy | connection | escape | confidence | other | null
checkinsAccepted: bool
metrics: {peak, timeToPeakMs, timeToHalfMs|null, durationMs, drop, delayMs}   // computed at close (§10)
```

Writes:
- Every user interaction in an active moment writes to IDB immediately and updates `lastInteractionAt`.
- Never hold moment state only in memory.

### 5.4 D1 schema (`worker/schema.sql`)

```sql
CREATE TABLE devices (
  id TEXT PRIMARY KEY, auth_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0);
CREATE TABLE records (
  device_id TEXT NOT NULL, store TEXT NOT NULL, id TEXT NOT NULL,
  updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  iv TEXT, ct TEXT, server_seq INTEGER NOT NULL,
  PRIMARY KEY (device_id, store, id));
CREATE INDEX records_seq ON records (device_id, server_seq);
CREATE TABLE push_subs (
  endpoint TEXT PRIMARY KEY, device_id TEXT NOT NULL,
  p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX push_subs_device ON push_subs (device_id);
CREATE TABLE checkins (
  id TEXT PRIMARY KEY, device_id TEXT NOT NULL,
  due_at INTEGER NOT NULL, kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER);
CREATE INDEX checkins_due ON checkins (status, due_at);
CREATE TABLE vapid_cache (audience TEXT PRIMARY KEY, jwt TEXT NOT NULL, exp INTEGER NOT NULL);
```

---

## 6. Screens and flows

### 6.0 Global

Routes:

| Route | Screen |
|---|---|
| `#/install` | Install gate |
| `#/home` | Home |
| `#/moment` | Start / rating |
| `#/moment/distance` | Distance |
| `#/moment/surf` | Surf (Delay) |
| `#/moment/distract` | Distract list |
| `#/moment/doing/:optionId` | Doing |
| `#/moment/decide` | Decide hub |
| `#/moment/decide/tape` | Play it forward |
| `#/moment/decide/thought` | The thought |
| `#/moment/decide/words` | Your words |
| `#/moment/close` | Close sequence |
| `#/moment/after` | After-using (quiet) |
| `#/checkin/:id` | Check-in |
| `#/lookback` | Look back |
| `#/lookback/:momentId` | Moment detail |
| `#/lists` | My lists |
| `#/setup/:item` | Setup |
| `#/learn` | Learn |
| `#/settings` | Settings |
| `#/restore/:token` | Restore |

Chrome on every screen:
- Top-right text link "More help", which opens the sheet in §6.12. This includes the moment flow.
- Back control where a parent exists.
- No tab bar.

Layout:
- Single column, max width `--content-max`, centered.
- Respects safe-area insets.
- One primary action per screen.

Transitions: crossfade only, `--dur-base`.

### 6.1 Launch and install gate

1. Boot reads IDB.
2. If there is an active moment with `now - lastInteractionAt < 30 min`, route straight into the moment at its last step. Skip Home.
3. If iOS and not standalone (`navigator.standalone !== true` and no `display-mode: standalone` match), show `#/install`:
   - Steps: Share icon → "Add to Home Screen" → open Moment from the Home Screen.
   - Note: "Your data stays with the Home Screen app. Set it up there."
   - Secondary link: "Use in the browser anyway", which sets `installDismissedAt`.
4. Otherwise go to Home. If a check-in is due (§7.5), route to it instead.

Also on boot:
- Call `navigator.storage.persist()` if available.
- Register the service worker.
- Register the device (§4) when online.

### 6.2 Home

- Main button:
  - Full-width, min-height 9rem, label "I'm in a moment".
  - One tap creates the moment, starts its clock, and routes to `#/moment`.
- Status line, only when a check-in plan is active:
  - "Next check-in around 9:40 pm"
  - Plus a "Stop for today" link.
- Unfinished line, only when one exists from the last 24 h:
  - "Your last moment didn't get a check-out. Add one?"
  - Opens that moment's Close (rating, outcome, triggers, seeking). Dismissible.
- Setup card (rules in §6.9). One item, "Not now" to dismiss.
- Cumulative line, small and muted, only when N ≥ 1: "Moments you've stayed with: N".
- Footer links: Look back · My lists · Learn · Settings.

### 6.3 Moment flow

DDD step indicator at the top of every moment screen: `Delay · Distract · Decide`.
- The active step is highlighted.
- All three are tappable, in any order.
- "I'm done" text button is always present and goes to Close.

**6.3.1 Start (`#/moment`)**
- Title: "Where is it right now?"
- Slider 0–10 (§13.6), no default value. Tapping a value records the `initial` rating.
- "Skip" link.
- Next goes to Distance.

**6.3.2 Distance (`#/moment/distance`)** (Delay; stimulus control)
- Title: "First, some distance."
- Body: "If you can, move away from what set this off. Another room, outside, phone face down."
- Buttons: "Done" / "Not right now" → Surf.

**6.3.3 Surf (`#/moment/surf`)** (Delay; urge surfing)

Layout, top to bottom:
1. Step indicator.
2. Wave canvas, ~40vh (§14).
3. Guidance line.
4. Inline chips area.
5. Compact slider, always usable.
6. Delay timer text ("Delay · 11:20 left").
7. Actions row:
   - "Try something" → Distract
   - "Talk it through" → Decide
   - "It's eased" → Close

Guidance sequence:
- Shown via `guidance.js`.
- Each line advances on "Next" or automatically after 30 s.
- Auto-advance pauses while any control has focus.
- Lines are announced with `aria-live="polite"`.

| # | Line | Inline control |
|---|---|---|
| 1 | "You don't have to do anything with this. Just watch it." | none |
| 2 | "Where do you feel it?" | body chips, multi-select |
| 3 | "What's it like?" | sensation chips, multi-select |
| 4 | "What set it off? (optional)" | trigger chips, multi-select. If an if-then plan matches, show plan card: "Your plan: {thenText}" |
| 5 | "Breathe with the wave. In as it rises, out as it falls." | none |
| 6 | "Urges build, peak, and pass. You're watching one do that." | none |
| 7 | Evidence line (§10.3), only when available | none |
| 8 | "Still here. Still watching." | then loop to 5 |

Rating prompt:
- Every `ratingPromptSec`, the slider gets a soft glow and the line "Where is it now?" appears.
- It is never modal and never blocks.

Delay timer:
- `delayTargetMin` comes from settings.
- Elapsed time derives from `startedAt`, never from interval counting.
- At target: the line becomes "Delay time's up. Where is it now?" and the action buttons are promoted.
- Adds a "Keep surfing" button that extends by the same interval.

Rising rule:
- Triggers when any of these is true:
  - the latest rating is ≥ the previous rating + 2
  - there are 3 consecutive increases
  - the rating is 10
- Shows an inline card, at most once per 10 min:
  - Title: "This is a big one."
  - Options: "Change where you are" → Distance; "Easiest options" → Distract with the low-energy filter on; "More help" → sheet.

Long rule:
- At elapsed ≥ 45 min, show an inline card once:
  - "Long one. You can keep going, or let me check on you through the day."
  - "Keep going" / "Check on me". "Check on me" goes to Close with the check-in offer preselected.

**6.3.4 Distract (`#/moment/distract`)**
- Title: "Pick one. Go do it. Come back when you're done."
- "Low energy" toggle shows only `effort: low`.
- List of visible options in `order`, each a card with a category icon and label.
- "Something else" opens an inline add field. Saving adds the option to the list.
- Selecting an option:
  - records `distractUses[]` with `ratingBefore` = the latest rating
  - routes to Doing

**6.3.5 Doing (`#/moment/doing/:optionId`)**
- Shows the option label large, the ambient wave (no plot), and the elapsed time.
- Line: "Go. I'll be here."
- Button "I'm back" → slider "Where is it now?":
  - Records the rating with `src: return`.
  - Records `ratingAfter` and `returnedAt`.
  - Returns to Surf.
- Secondary: "Pick something else" → Distract.

**6.3.6 Decide hub (`#/moment/decide`)**
- Three cards, any order:
  - "Play it forward"
  - "The thought"
  - "Your words"
- Below them, "Your plans" lists matching or all if-then plans, up to 3.

**6.3.7 Play it forward (`#/moment/decide/tape`)**
- Four screens, each with Next:
  1. "If you went with the urge, what does the next hour look like?"
  2. "What about tonight?"
  3. "What about tomorrow morning?"
  4. "And if you ride this out, what does tomorrow morning look like?"
- Each screen has an optional collapsed field "Write it (optional)".
- Sets `tapeViewed`. Notes are stored only if written.

**6.3.8 The thought (`#/moment/decide/thought`)**
- Title: "Is one of these thoughts here?"
- Shows the list of visible permission thoughts.
- Tap a thought → its counter appears large in the `--c-sand` "own words" style.
- Records `thoughtIds`.
- "None of these" returns to the hub.

**6.3.9 Your words (`#/moment/decide/words`)**
- Shows the reasons list and the message to self, styled as the user's own voice.
- If empty:
  - Show "You haven't written these yet. When things are calmer, Setup can help."
  - Show two neutral defaults:
    - "This feeling is strong, and it's temporary."
    - "Getting through the next hour is enough."
- Sets `wordsViewed`.

### 6.4 Close (`#/moment/close`)

Sequence. Each screen is skippable except Outcome, which has a "Rather not say" option.

1. **Rating:** "Where is it now?" Shown only if the last rating is more than 2 min old. `src: close`.
2. **Outcome:** "Where are you now?"
   - Primary options, equal weight:
     - "It passed" → `passed`
     - "It's quieter" → `quieter`
     - "Still strong" → `strong`
   - Small plain-text link "Something else" expands to:
     - "I used" → `used`
     - "I had to stop" → `stopped`
     - "Rather not say" → `private`
   - `strong` shows: "Start another round" (new moment, `previousMomentId` set) / "Check on me in 10 min" / "Continue".
   - `used` routes to §6.5, then resumes at step 5.
3. **Triggers:** shown only if none were chosen during Surf. Optional.
4. **Seeking:** shown only if `settings.shadowPrompt` is on and the flag is enabled.
   - "What was the urge trying to get for you?"
   - Options: Relief / Energy / Connection / Escape / Confidence / Something else. Skippable.
5. **Summary:** factual only, from §10.
   - If there's a drop ≥1: "You stayed with it {duration}. It went from {first} to {last}."
   - Otherwise: "You stayed with it {duration}."
   - Then: "Moments you've stayed with: {N}".
6. **Check-in offer:** "Want me to check on you today?"
   - Buttons: "Yes" / "In 10 min" / "No thanks".
   - If a plan is already active: "Check-ins are on. Next around {time}." with "Also in 10 min" / "Done".
7. Set `status: closed` and `endedAt`, compute metrics, queue sync, go to Home.

### 6.5 After-using (`#/moment/after`)

- Reached only via Outcome → "Something else" → "I used".
- Never linked elsewhere. No visual emphasis anywhere else.
- Copy (final):
  - Title: "You're still here."
  - "The day isn't over. Let's get you through the rest of it safely."
  - Bullets:
    - "Try not to be alone. If you are, Never Use Alone (1-800-484-3731) stays on the line and sends help if you stop responding."
    - "Supply can contain fentanyl. Keep naloxone (Narcan) close if you can."
    - "Call 911 for chest pain, overheating, a seizure, trouble breathing, or if you're scared."
    - "Drink water. Eat something small. Rest when you can."
    - "988 is there if things feel heavy."
  - Phone numbers are `tel:` links. 988 also gets an `sms:` link.
- Buttons:
  - "Check on me later" → accepts the check-in plan → continues the close at Summary.
  - "Home".
- Data handling:
  - `used` is stored.
  - It is never shown in aggregates (§10.4).
  - It can be edited in the moment detail view.

### 6.6 Check-in (`#/checkin/:id`)

- Title by kind:
  - `morning`: "Morning. How's today starting?"
  - All others: "How's the next hour looking?"
- Buttons:
  - "Okay" → `okay` → Home.
  - "Rough" → options screen:
    - "Start a moment"
    - "Pick something to do" (starts a moment at Distract)
    - "Check again in 30 min" (adds `again30`)
  - "Start a moment" → new moment.
  - "In 10 min" → adds `plus10`.
  - Link "Stop for today" → cancels all pending check-ins. Also links to Settings to turn check-ins off.
- Answering marks the check-in `answered` locally and calls `POST /v1/checkins/:id/ack`.

### 6.7 Look back (`#/lookback`)

- Sections render only when their threshold is met (§10). Otherwise the screen shows one line: "After a few moments, patterns will show up here."
- Every chart has a text summary as its `<figcaption>`.
- Sections, in order:
  1. **Summary:** cumulative count, typical ease time, trend sentence (§10.3).
  2. **Wave overlay:** last 10 eligible moments as faint curves on 0–60 min, plus a median curve.
  3. **Easing over time:** weekly median `timeToHalf`, last 8 weeks, bars.
  4. **When:** 7 days × 4 blocks (Night 0–6, Morning 6–12, Afternoon 12–18, Evening 18–24). Shading by count, numbers on cells.
  5. **What sets them off:** top 6 trigger tags, counts.
  6. **Where you feel it:** body location counts.
  7. **What tends to help:** distract options with ≥2 uses, median drop. Caption: "Patterns in your moments, not proof."
  8. **Talking it through:** % of moments that reached Decide; top 3 permission thoughts.
  9. **What it was after:** seeking counts. Only shown when the flag is on.
  10. **Recent moments:** list by date/time, duration, peak → moment detail.
- Moment detail:
  - Shows the plotted curve, steps taken, distract uses, triggers, and body locations.
  - "How it ended" is editable using the same options as §6.4.
  - "Delete this moment".

### 6.8 My lists (`#/lists`)

- Three tabs, rendered as a segmented control:
  - Things to do (distract)
  - What sets it off (triggers)
  - Thoughts (permission thought + counter)
- Per item: edit, hide/show, reorder (move up/down buttons; drag MAY be added).
- Add new.
- Built-in items can be hidden, not deleted. "Restore defaults" per list.

### 6.9 Setup (`#/setup/:item`)

Items, in order:

1. **`reasons`:** "Why getting through these moments matters to you."
   - Add up to 7 short lines.
   - Placeholder: "So I can wake up clear tomorrow."
2. **`message`:** "A note from steady you to craving you."
   - Textarea ≤400 chars.
   - Placeholder: "I know this feels endless. It isn't. Get to morning."
3. **`thoughts`:** review the permission thoughts. "Rewrite the answers in your own words."
4. **`plans`:** "If [trigger], then I'll…"
   - Pick a trigger tag.
   - Pick a distract option or write a then-text.

Setup card on Home shows when all of these are true:
- no active moment
- no moment closed in the last 2 h
- not already shown today
- at least one item incomplete

Also:
- One item per card. "Not now" dismisses for the day.
- Setup is never offered via notification.
- Reachable anytime from Settings.

### 6.10 Learn (`#/learn`)

Five cards. Each opens a short read. Copy is final.

1. **Urges are waves.** "An urge builds, peaks, and passes, even when it feels like it won't. Each time you ride one out, the pull tends to weaken. Acting on it teaches your brain to expect relief from that one thing. Watching it teaches something else: you can feel this and stay put."
2. **Flat days.** "Feeling flat, tired, or unable to enjoy much is common in early recovery from stimulants. Your reward system is recalibrating, and this tends to ease over weeks to months. On flat days, aim small and easy. The low-energy filter is there for this."
3. **Sleep and urges.** "Being tired makes urges louder and harder to sit with. Rest counts as coping. Lying down with something familiar on is a real option."
4. **Thoughts that give permission.** "Some thoughts show up to make going with the urge feel reasonable: just once, I've earned it, I can handle it. They're normal and predictable. Naming one takes some of its power. Your answers are there to talk back in your own words."
5. **Why there's no day count.** "Counters reset, and a reset can make a hard day feel like everything's gone. Moment counts the moments you've stayed with instead. That number only goes up."

### 6.11 Settings (`#/settings`)

- **Check-ins:**
  - on/off
  - evening time, morning time
  - quiet hours start/end
  - notification state, one of:
    - "On"
    - "Off -- turn on in iOS Settings → Notifications → Moment"
    - "Not supported here"
  - "Turn on notifications" button when the permission is `default`
- **Moments:**
  - delay length (5/10/15/20)
  - rating prompt interval (1/2/3 min)
  - "Ask what the urge was after" toggle (`shadowPrompt`)
- **Motion:** System / Reduce / Full.
- **Setup:** links to the 4 items.
- **Your data:**
  - Sync status ("Synced 2 min ago" / "Offline -- will sync later").
  - "Your restore link": reveal + copy, with warning.
  - "Export": JSON of all stores except `meta.secret`.
    - Uses `navigator.share({files})` when available.
    - Otherwise downloads via a Blob URL.
  - "Delete everything":
    - Two-step confirm: type DELETE.
    - Wipes IDB, unsubscribes push, calls `DELETE /v1/devices/me`, unregisters the SW caches, then reloads to first run.
- **Support person:** hidden unless `FLAGS.humanSupport` (§18).
- **About:** version, "Moment isn't medical care. In an emergency, call 911."

### 6.12 More help sheet

Bottom sheet, reachable from every screen:
- "In danger or someone's hurt: 911" (`tel:911`)
- "988 Suicide & Crisis Lifeline: call or text 988" (`tel:988`, `sms:988`)
- "SAMHSA National Helpline, free and 24/7: 1-800-662-4357" (`tel:`)
- Footer: "US numbers."

Data shape: `content/resources.js` keyed by locale, for later expansion.

### 6.13 Restore (`#/restore/:token`)

- Parse `deviceId.secret`. On parse failure: "This link doesn't look right."
- If local data exists, offer:
  - "Replace this device's data": wipe local, adopt the identity, full pull.
  - "Merge": adopt the identity, then LWW merge.
- After restore, re-register push and clear the fragment from the URL (`history.replaceState`).

---

## 7. Check-ins and push

### 7.1 Plan generation (`lib/schedule.js`, pure)

Input: `closeTime` (ms), settings, and the IANA time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`).

Rules:
- Create:
  - `plus30` = close + 30 min
  - `plus2h` = close + 2 h
- `evening` = `eveningTime` today, only if close is before `eveningTime` − 60 min.
- `morning` = `morningTime` on the next local date.
- Quiet hours:
  - `plus10`, `plus30`, `again30` always keep their time, since the user just asked.
  - Any other item that falls inside quiet hours moves to `quietEnd`.
- Dedupe: if two items are within 45 min of each other, keep the earlier one.
- The plan ends after `morning`.
- Local wall times are computed DST-safe via Intl per date.
- Output is absolute UTC ms.
- "In 10 min" adds `plus10` = now + 10 min.

Lifecycle:
- Accepting a plan replaces all pending items.
- Starting a moment cancels pending items due within the next 60 min.
- "Stop for today" cancels all pending items.
- After any plan change: write locally, then `PUT /v1/checkins` (queued if offline).
- On app open: if the time zone changed since the plan was made, regenerate the pending items.

### 7.2 Permission and subscription (`services/push.js`)

- Request permission only inside the tap handler of "Yes", "In 10 min", or "Check on me later", and only the first time. iOS requires a user gesture.
- Preconditions: `'PushManager' in window`, `Notification.permission === 'default'`, and standalone on iOS.
- On grant:
  - `pushManager.subscribe({userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY})`
  - `PUT /v1/push-subscription`
  - Store the endpoint in `meta`.
- On every app open: compare the current subscription endpoint with `meta`. If it differs, re-PUT.
- If denied or unsupported:
  - Keep the plan locally for in-app delivery (§7.5).
  - Show a one-time sheet: "Notifications are off, so check-ins will show up when you open Moment." Set `notifExplainedAt`.

### 7.3 Server sender (`worker/src/checkins.js`, cron)

Each run:
1. `SELECT ... WHERE status='pending' AND due_at <= now ORDER BY due_at LIMIT 3`.
2. For each item:
   - If `due_at < now − 30 min`, mark `expired`.
   - Otherwise send to every `push_subs` row for the device.
3. Send outcomes:
   - 2xx → `sent`, `sent_at`.
   - 404/410 → delete that subscription.
   - 429/5xx → `attempts++`. At 3 attempts, mark `failed`.
4. Daily housekeeping, on the first run after 03:00 UTC: delete check-ins with status ≠ pending older than 7 days.

VAPID and request headers:
- Cache the VAPID JWT per push-service origin in `vapid_cache` with a 12 h exp, to save CPU.
- `TTL: 1800`, `Urgency: normal`, `Topic: checkin`.

CPU budget:
- Log CPU via `wrangler tail` during M6.
- If the 10 ms limit is hit, lower LIMIT to 1 and document it as a new DD entry.

### 7.4 Push payload and SW

- Payload, encrypted: `{"t":"checkin","id":"<id>","kind":"<kind>"}`.
  - No user content. The server can't read user data anyway.
- SW `push` handler:
  - Parse the payload, pick the body from the `kind` map, and call `showNotification("Moment", {body, tag: "checkin", data: {id}})`.
  - On parse failure, show a generic body.
  - MUST show a notification for every push. iOS revokes permission otherwise.
- Bodies by kind:
  - `morning`: "Morning. How's today starting?"
  - All others: "Checking in. How's the next hour?"
- SW `notificationclick`: focus an existing client and navigate it, or `openWindow("./#/checkin/" + id)`.

### 7.5 In-app delivery (fallback and redundancy)

- On launch or `visibilitychange` to visible, with no active moment:
  - Find the latest local check-in with status pending or sent, `dueAt ≤ now`, and `dueAt ≥ now − 3 h`, unanswered.
  - Route to it.
- Older unanswered items are marked `expired`.

---

## 8. Worker API (`/v1`, JSON)

Cross-cutting:
- CORS:
  - `Access-Control-Allow-Origin: ALLOWED_ORIGIN` only.
  - Preflight handled.
  - Methods `GET, POST, PUT, DELETE`.
  - Headers `Authorization, Content-Type`.
- Body size: reject anything >1 MB with 413.
- Errors: `{error: "code"}`, using standard status codes.
- Auth is required everywhere except `POST /v1/devices` and `GET /v1/health`.
- Every authenticated request updates `devices.last_seen`, at most once per hour.

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/v1/health` | none | `{ok: true}` |
| POST | `/v1/devices` | `{deviceId, authToken}` | 201 new / 200 same hash / 409 different hash |
| DELETE | `/v1/devices/me` | none | 204; deletes all rows for the device across all tables |
| POST | `/v1/sync` | `{cursor, changes: [{store, id, updatedAt, deleted, iv, ct}]}` | `{cursor, changes: [...]}` |
| PUT | `/v1/push-subscription` | `{endpoint, keys: {p256dh, auth}}` | 204 upsert by endpoint |
| DELETE | `/v1/push-subscription` | `{endpoint}` | 204 |
| PUT | `/v1/checkins` | `{items: [{id, dueAt, kind}]}` | 204; replaces all pending for the device |
| POST | `/v1/checkins/:id/ack` | none | 204; status → answered |

Validation:
- Sync: ≤200 changes per request, `ct` ≤64 KB each, `store` must be in the synced store list.
- Check-ins: ≤10 items, `dueAt` within [now − 5 min, now + 48 h].

Sync semantics (server):
- For each incoming change: if there's no stored row or `updatedAt ≥` the stored `updated_at`, upsert it with `server_seq = ++devices.seq`.
- Response: all rows with `server_seq > cursor`, excluding rows just written from this request. The new cursor is the max `server_seq`.
- Use D1 `batch()` for atomicity.

---

## 9. Sync (client, `lib/sync.js`)

- Local writes to synced stores enqueue `{store, id}` in `syncQueue`.
- Sync runs on:
  - app open
  - moment close
  - settings or list change (debounced 3 s)
  - every 5 min while visible
  - the `online` event
- Each run:
  1. Encrypt queued records.
  2. `POST /v1/sync` with `cursor`.
  3. Decrypt incoming records.
  4. LWW apply by `updatedAt`; ties go to the higher `id`.
  5. Clear sent queue entries.
  6. Save the cursor.
- Active moments sync on close only. Mid-moment writes stay local, to save requests and battery.
- Failures: exponential backoff 30 s → 10 min. The app never blocks on sync.
- Status for Settings: `lastSyncAt`, `pending` count, `offline` flag.

---

## 10. Metrics and trends (`lib/metrics.js`, pure, fully tested)

### 10.1 Per moment (computed at close; recomputed on edit)

- `ratings` sorted by `t`.
- `peak` = max `v`.
- `timeToPeakMs` = `t` of the first rating equal to the peak.
- `timeToHalfMs` = `t` of the first rating after the peak with `v ≤ peak / 2`, minus `timeToPeakMs`.
  - Null if peak ≤ 2 or the condition is never met.
- `durationMs` = `endedAt − startedAt`.
- `drop` = first `v` − last `v`.
- `delayMs` = time from start to the first `distract` or `decide` step (or to close if neither).
- Eligible for curve metrics: ≥3 ratings and peak ≥3.

### 10.2 Distract effect

- Per use: `ratingBefore − ratingAfter`.
- Requires both values, and `returnedAt − startedAt ≤ 30 min`.
- Option stat: median effect over uses, n ≥2 to display.

### 10.3 Summaries

- **Cumulative count:** all moments with status `closed`. Never decreases, except when the user deletes a moment.
- **Evidence line** (Surf step 7):
  - Requires ≥3 eligible moments among the last 10.
  - Uses the median `timeToPeak` and median `timeToHalf` from eligible moments with non-null values, rounded to whole minutes, minimum 1.
  - Copy: "Your recent moments peaked around {p} min and eased by half around {h} min."
  - If `timeToHalf` is unavailable: "Your recent moments peaked around {p} min."
- **Trend sentence:**
  - Requires ≥10 eligible moments with `timeToHalf`.
  - Compare the median of the last 5 with the median of the prior 5.
  - ≤ −20%: "Lately they're easing faster than before."
  - ≥ +20%: "Lately they're taking longer to ease. Hard stretches happen."
  - Otherwise: "About the same as before."
- **Weekly bars:** weeks start Monday, local time. Show a week only if it has ≥2 eligible moments.

### 10.4 Display rules

- Moments with outcome `used`:
  - Included in timing metrics, since their curves are still data.
  - Never counted or labeled in any aggregate, chart, or list.
  - Visible only in that moment's detail.
- Moments with status `unfinished` and no ratings are excluded from all metrics.
- Wording is always descriptive ("in your moments"). Never evaluative.

---

## 11. Prefilled content (`content/defaults.js`)

### 11.1 Distract options (`builtIn: true`)

| Label | Category | Effort |
|---|---|---|
| Take a shower | body | low |
| Drink a glass of cold water | body | low |
| Eat something | body | low |
| Lie down under a blanket | body | low |
| Stretch for five minutes | body | low |
| Walk around the block | body | medium |
| Go to a different room | place | low |
| Step outside | place | low |
| Go somewhere public | place | medium |
| Make tea | hands | low |
| Tidy one small thing | hands | low |
| Wash the dishes | hands | medium |
| Put on a show you've seen before | mind | low |
| Listen to a podcast or album | mind | low |
| Play a simple phone game | mind | low |
| Text someone about anything else | mind | low |

### 11.2 Trigger tags

- **halt:** Hungry, Angry, Lonely, Tired.
- **context:** A person, A place, Time of day, A message or app, Stress, Boredom, Celebrating, Can't sleep, Money came in.

### 11.3 Permission thoughts → counters (first person, editable)

| Thought | Counter |
|---|---|
| Just once. | I know where once goes. This will pass without it. |
| I've earned it. | I've earned a good night. There are other ways to give myself one. |
| I can handle it. | Handling it means not testing it tonight. |
| I'll start fresh tomorrow. | Tomorrow-me needs me to get through tonight. |
| No one will know. | I'll know, and I'm the one waking up tomorrow. |
| I can't take this feeling. | It's strong and it's temporary. I can watch it peak and fall. |
| Nothing else will help. | Nothing will feel as fast. Something can still help a little. |

---

## 12. Copy rules (`strings.js`)

- Second person, present tense, sentence case, contractions allowed.
- Moment-flow lines are ≤12 words.
- No exclamation points.
- No praise words: great, proud, amazing, awesome, well done, congrats.
- No shame or clinical words: relapse, slip, clean, dirty, addict, fail, sober, streak.
- No drug names or drug-use verbs outside §6.5 and the Outcome option "I used".
- Numbers as digits. Times in the device locale format.
- Strings are keyed by screen, e.g. `strings.surf.guidance[0]`. No user-facing literals in screen modules.

---

## 13. Design system (`css/tokens.css`)

All values are CSS custom properties on `:root`. Each token carries a comment with its DD id and rationale. Theme hook: `:root[data-theme="dark"]` is the only theme in v1. `lightTheme` flag reserved.

### 13.1 Color (DD-020)

```css
--c-bg:            #121418;  /* near-black, not pure black: less halation on OLED at night */
--c-surface:       #1a1e24;
--c-surface-2:     #222831;
--c-border:        #2e3540;
--c-text:          #e9e6df;  /* warm off-white, not pure white: less glare */
--c-text-2:        #b3b8bf;
--c-text-3:        #8a9099;  /* ≥4.5:1 on --c-bg */
--c-accent:        #8cc3cc;  /* calm desaturated teal; primary actions, wave */
--c-accent-ink:    #0f2a2e;  /* text on accent */
--c-sand:          #d2b98f;  /* user's own words: reasons, message, counters */
--c-focus:         #f0e2b6;
--c-wave-ambient:  rgba(140,195,204,0.14);
--c-wave-line:     #8cc3cc;
--c-wave-point:    #e9e6df;
--c-notice:        #d2b98f;  /* errors/notices use sand + icon + text; no red anywhere (DD-021) */
```

Intensity is encoded by position and number, never by a color ramp (DD-022).

### 13.2 Type (DD-023)

- `html { font: -apple-system-body; }` enables iOS Dynamic Type. Fallback `font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Scale in rem:
  - `--fs-xs .8125`
  - `--fs-sm .9375`
  - `--fs-md 1`
  - `--fs-lg 1.25`
  - `--fs-xl 1.625`
  - `--fs-2xl 2.25`
  - `--fs-num 3.5` (slider value)
- Line height: `--lh-body 1.45`, `--lh-head 1.2`.
- Weights 400 and 600 only.

### 13.3 Space, shape, layout

- Spacing on a 4px base: `--sp-1 .25rem`, `--sp-2 .5rem`, `--sp-3 .75rem`, `--sp-4 1rem`, `--sp-5 1.5rem`, `--sp-6 2rem`, `--sp-7 2.5rem`, `--sp-8 3rem`.
- Radii: `--r-sm 10px`, `--r-md 16px`, `--r-lg 24px`, `--r-pill 999px`. Soft corners (DD-024).
- `--tap-min 48px`. Exceeds the 44pt minimum (DD-025).
- `--content-max 560px`, `--gutter 16px`. Padding adds `env(safe-area-inset-*)`.
- No shadows. Elevation via surface steps (DD-026).

### 13.4 Motion (DD-027)

- `--dur-fast 180ms`, `--dur-base 320ms`, `--dur-slow 600ms`.
- `--ease-out cubic-bezier(.2,.7,.2,1)`.
- `--wave-period 10s`, `--wave-rise 4s`, `--wave-fall 6s`. About 6 breaths/min, with a longer exhale.
- No bounce, spring, shake, or pulse faster than the wave.
- `prefers-reduced-motion` or setting "Reduce" (§14.3):
  - Crossfades become instant.
  - The ambient wave becomes static.
  - The breathing cue becomes text: "In… 4. Out… 6."

### 13.5 Components

- **Primary button:** pill, full width, `--c-accent` background, `--c-accent-ink` text, min-height `--tap-min`.
- **Secondary:** text button, `--c-text-2`.
- **Home moment button:** `--r-lg`, `--c-surface-2` with a 1px `--c-accent` border, label `--fs-xl`. Calm, not alarming (DD-028).
- **Chips:** pill, `--c-surface-2`. Selected state uses `--c-accent` border + check icon, so state isn't shown by color alone.
- **Cards:** `--c-surface`, `--r-md`, `--sp-4` padding.
- **Sheet:** bottom sheet, `--c-surface`, dismiss by tapping the scrim or the close button.
- **"Own words" style:** `--c-sand` text, `--fs-lg`, left rule 2px `--c-sand`.
- **Icons:** inline SVG, 1.5px rounded stroke, 24px.
  - Set: back, help, body, place, hands, mind, check, close, plus, up, down.
  - No emoji in UI.
- **App icon:**
  - Abstract single wave on `--c-bg`. No text.
  - Maskable variant.
  - Manifest `theme_color` and `background_color` = `#121418`, `display: standalone`.
- **iOS meta:**
  - `apple-mobile-web-app-capable`
  - `apple-mobile-web-app-status-bar-style: black-translucent`
  - `apple-touch-icon` 180.
  - Disable pull-to-refresh via `overscroll-behavior: none` on `html, body`.

### 13.6 Intensity slider (DD-029)

- Native `<input type="range" min=0 max=10 step=1>`, restyled.
- Thumb ≥ 44px.
- Value shown large (`--fs-num`) above the slider.
- Anchor word below the value: 0 Nothing · 1–2 Faint · 3–4 Noticeable · 5–6 Strong · 7–8 Very strong · 9–10 Most ever.
- `aria-valuetext` = "{v} of 10, {anchor}".
- Start screen: no initial value. Thumb hidden until the first tap on the track.

---

## 14. The wave (`ui/wave.js`)

### 14.1 Canvas

- DPR-aware canvas sized to its container.
- Redraws on resize.
- Pauses its rAF loop when hidden or reduced motion is on.

### 14.2 Layers

1. **Ambient:** a filled sine band in `--c-wave-ambient`.
   - Height oscillates with an asymmetric cycle: rise `--wave-rise`, fall `--wave-fall`.
   - Doubles as the breathing pacer.
2. **Plot:**
   - Ratings as points (`--c-wave-point`).
   - Joined by a smoothed monotone curve (`--c-wave-line`).
   - X = elapsed time, auto-scaled to max(delayTarget, elapsed + 2 min).
   - Y = 0–10.
   - Faint gridlines at 0, 5, 10 with small labels.
3. **Now marker:** a thin vertical line at the current elapsed time.

### 14.3 Behavior

- New ratings animate in over `--dur-base`.
- Reduced motion:
  - Ambient band is static.
  - Points appear instantly.
  - Breathing text cue shown instead.

### 14.4 Accessibility

- Canvas `role="img"`.
- Adjacent visually-hidden live summary: "{n} ratings. Started at {a}, now {b}, peak {p}."

---

## 15. Accessibility (WCAG 2.2 AA)

- Contrast: text ≥4.5:1, large text and UI ≥3:1. Verified for all token pairs.
- Every control reachable and operable by keyboard and VoiceOver.
- Visible focus ring: 2px `--c-focus`, offset 2px.
- Targets ≥48px. Adjacent targets spaced ≥8px.
- Respects Dynamic Type up to the largest accessibility size. Layout reflows, nothing truncates mid-word, slider still usable.
- No time limits that force action. Timers are informational. Auto-advancing guidance pauses on focus and is always replayable.
- `lang="en"`. Landmarks: header, main.
- Live regions polite only.
- Both orientations supported.
- Charts: text summary always present (§6.7).

---

## 16. Edge cases

| # | Case | Behavior |
|---|---|---|
| E1 | App killed or backgrounded mid-moment | State already in IDB. Reopen within 30 min → resume at last step, timers derived from `startedAt`. |
| E2 | Reopen after ≥30 min idle | Mark `unfinished`, `endedAt = lastInteractionAt`. Home offers a check-out for 24 h. |
| E3 | Tap "I'm in a moment" while one is active | Resume the active one. Only one active moment at a time. |
| E4 | New moment within 10 min of closing one | New record with `previousMomentId`. Metrics stay per moment. |
| E5 | No ratings given | Moment saved. Metrics null. Excluded from curve metrics. Summary shows duration only. |
| E6 | Intensity rises | Rising rule (§6.3.3). |
| E7 | Moment >45 min | Long rule (§6.3.3). |
| E8 | Moment >3 h active | Auto-close as `unfinished` at next open. |
| E9 | Very short moment (<1 min) | Saved. Curve metrics require eligibility (§10.1). |
| E10 | Outcome tapped by mistake | Editable in moment detail. Metrics recompute. |
| E11 | Notification permission denied or unsupported | In-app check-ins (§7.5). One-time explanation. Settings shows state + fix path. |
| E12 | Opened in Safari tab on iOS | Install gate (§6.1). If dismissed, banner on Home: "Data here stays in this browser tab." |
| E13 | Offline at close | Plan saved locally. In-app delivery still works. `PUT` queued and sent on reconnect. If items already passed, skip them. |
| E14 | Push subscription expired | Server deletes it on 404/410. Client re-subscribes on next open. |
| E15 | Time zone or DST change | Regenerate pending local-time items on open (§7.1). |
| E16 | Push arrives during an active moment | SW shows it. Tapping it opens the active moment, not the check-in. Starting a moment already cancels items due within 60 min. |
| E17 | Multiple tabs or windows | IDB is truth. Re-read on `visibilitychange`. `BroadcastChannel("moment")` notifies other tabs of writes. |
| E18 | SW update available mid-moment | Never reload during an active moment. New SW activates at next launch with no active moment (`SKIP_WAITING` message), one reload. |
| E19 | IDB unavailable (private mode) or quota error | Memory mode with persistent banner "Saving is off in this browser mode." Export still offered. |
| E20 | Storage eviction | `storage.persist()` requested. Server copy allows restore. Settings shows persistence state. |
| E21 | Restore link malformed or wrong | Clear error. No data changed. |
| E22 | Restore onto device with data | Replace or Merge choice (§6.13). |
| E23 | Same identity on two devices | Both sync via LWW. Push goes to all subscriptions for that identity. |
| E24 | Delete everything while plan pending | `DELETE /v1/devices/me` removes check-ins and subs server-side. If offline, local wipe proceeds and the server delete is retried on next open via a persisted `pendingServerDelete` flag in a fresh `meta`. |
| E25 | Worker CPU limit exceeded on send | Item stays pending. Retried next minute. Attempts cap (§7.3). |
| E26 | Device clock wrong | Due times are absolute UTC from the client. Server sends by server time. Accepted risk; documented. |
| E27 | User edits or deletes built-in list items | Hide only. "Restore defaults" brings them back. |
| E28 | If-then plan references hidden or deleted trigger | Plan shown without trigger match. Flagged in Setup for review. |
| E29 | Huge text size or narrow screen | Single column reflow. Wave min-height 180px. Controls stack. |
| E30 | Screen sleeps during Surf | Request `navigator.wakeLock.request("screen")` on moment start if supported. Re-request on `visibilitychange`. Release on close. |
| E31 | Free text containing drug words | Allowed. User content is never filtered. |
| E32 | Look back with little data | Thresholds hide sections. Single explanatory line shown. |

---

## 17. Privacy and security

- No analytics, telemetry, error reporting services, or third-party requests.
- CSP via `<meta http-equiv>` (Pages can't set headers):
  - `default-src 'self'`
  - `script-src 'self'`
  - `style-src 'self'`
  - `img-src 'self' data:`
  - `connect-src 'self' <API_BASE>`
  - `manifest-src 'self'`
  - `worker-src 'self'`
  - `base-uri 'none'`
  - `form-action 'none'`
- No inline scripts or styles.
- `<meta name="referrer" content="no-referrer">`.
- Secrets never leave the device except in the user-copied restore link.
- Worker:
  - Logs no request bodies.
  - Stores auth hashes only.
  - Rejects unknown stores.
- Export is plaintext JSON; Settings warns: "This file isn't encrypted."
- Notification text never contains user content.

---

## 18. Flags and stubs

`config.js`:

```js
export const FLAGS = {
  sync: true,
  push: true,
  shadowPrompt: true,     // seeking question at close (§6.4 step 4)
  humanSupport: false,    // support-person stub
  audioGuidance: false,   // guidance.js audio renderer
  haptics: false,         // feedback.js; iOS Safari lacks Vibration API
  lightTheme: false,
};
```

Stubs, with interfaces defined and implementations minimal:

- **`services/guidance.js`:**
  - `createGuidance({lines, onLine, mode: "text"|"audio"})`.
  - Text implemented.
  - Audio returns the text renderer and logs a TODO.
  - Future: recorded audio files, or a user-recorded message from Setup.
- **`services/feedback.js`:** `tick()`, `soft()`. No-ops. Future native wrapper hook.
- **`services/support.js`:**
  - Schema `{name, method: "sms"|"tel", number, message}`.
  - UI hidden behind the flag.
  - When enabled: Settings section + a "Reach {name}" option on the More help sheet and the Rough check-in screen.
- **Shadow work:** only the seeking question.
  - Reserve route `#/reflect` and a `reflections` store name in the migration plan (not created in v1). Future slow-mode prompts will link to logged moments.

---

## 19. Testing and acceptance

### 19.1 Automated

Run with `node --test` (Node ≥20 for global WebCrypto).

- `metrics.test.js`: all §10 definitions, null paths, thresholds, rounding, `used` exclusion from aggregates.
- `schedule.test.js`:
  - plan rules
  - quiet hours
  - dedupe
  - evening skip
  - DST spring-forward and fall-back for America/Los_Angeles
  - time zone change
- `sync.test.js`: LWW, tie-break, cursor handling, queue clearing.
- `crypto.test.js`: HKDF determinism, AES-GCM round trip, base64url.
- `worker.test.js`: handlers with an in-memory D1 shim:
  - auth success and failure
  - sync upsert and LWW
  - check-in replace
  - cron send status transitions
  - 410 subscription deletion

### 19.2 Manual iOS device checklist (M7)

- Install from Safari, open from Home Screen, airplane mode → full moment flow works.
- Cold open → main button → rating in ≤2 taps.
- Kill the app mid-Surf → reopen → resumes with correct elapsed time.
- Accept check-ins → permission prompt appears on tap → lock phone → push arrives → tap opens the check-in.
- Deny permission → in-app check-in appears on next open.
- Largest Dynamic Type → all screens usable.
- VoiceOver → complete a moment end to end.
- Reduce Motion on → static wave, text breathing cue.
- Restore link on a second device → data appears.
- Delete everything → server rows gone (verify via `wrangler d1 execute`).

### 19.3 Per-milestone acceptance criteria (§20)

---

## 20. Milestones

| M | Scope | Done when |
|---|---|---|
| M1 | Repo, Pages workflow, manifest, icons, SW precache (versioned `CACHE_VERSION`, cache-first shell, network-only API), router, tokens/base/components CSS, `strings.js`, IDB layer + migrations, install gate, Home, More help sheet, `DESIGN_DECISIONS.md` seeded | Installs on iOS, opens offline, Home and sheet render, tokens drive all styles |
| M2 | Full moment flow §6.3–6.5, wave + slider, guidance service, rising/long rules, resume/unfinished (E1–E9), wake lock | Complete moment offline; all edge cases E1–E10 pass manually; summary correct |
| M3 | My lists, Setup + Home card rules, Learn, Settings (local parts), export, local delete, defaults | Lists editable/hide/restore; setup items persist and appear in Decide |
| M4 | `metrics.js`, Look back, moment detail, evidence line | `metrics.test.js` green; sections respect thresholds; `used` never in aggregates |
| M5 | Worker scaffold, D1 schema, identity/auth, E2E-encrypted sync, restore, server delete | `sync`, `crypto`, `worker` tests green; two-device restore works |
| M6 | `schedule.js`, check-in screen, in-app delivery, push permission/subscription, cron sender, VAPID cache, SW push handlers | `schedule.test.js` green; real push received on iOS; CPU within free limits per `wrangler tail` |
| M7 | Accessibility pass, iOS checklist §19.2, copy audit against §12, CSP verification, README complete, DD log complete | Checklist fully passes; no copy-rule violations |

---

## Appendix A -- `DESIGN_DECISIONS.md` seed

Format per entry: `DD-### | Decision | Why | Override impact`.

| ID | Decision | Why | Override impact |
|---|---|---|---|
| DD-001 | Vanilla JS, no build, GitHub Pages | Owner preference; zero tooling; easy to read | Swapping in a framework touches every screen |
| DD-002 | Cloudflare Worker + D1 on free plan | Free, no card; 1-min cron for check-ins | Replace `api.js` + worker only |
| DD-003 | Local-first IDB as source of truth | Instant open, offline in crisis | Sync design depends on it |
| DD-004 | Anonymous identity + restore link, no login | No friction at the worst moment | Adding accounts affects §4, §6.13 |
| DD-005 | E2E encryption of synced data | Sensitive data; server should not read it | Server-side features (analytics) impossible by design |
| DD-006 | Hash routing | Pages has no SPA fallback | Path routing needs a 404.html shim |
| DD-007 | ≤2 taps to start a moment | Urges peak fast; friction loses the moment | Any added gate violates P1 |
| DD-008 | DDD as visible 3-step indicator, any order | Structure without rigidity | Removing it loses method framing |
| DD-009 | Distance step first | Stimulus control is high-yield for cue-driven cravings | Skippable; reordering changes Delay framing |
| DD-010 | Guidance text with manual + 30 s auto advance | Low load; screen reader friendly | Change interval in `guidance.js` |
| DD-011 | Ratings optional, prompted every 2 min, non-modal | Data without pressure | Changing to modal increases load |
| DD-012 | Rising and long rules | Escalation needs a different offer | Thresholds in `state.js` |
| DD-013 | Own-data evidence line after 3 moments | Personal evidence beats generic claims | Threshold in `metrics.js` |
| DD-014 | No streaks, day counts, badges | Resets after a lapse can trigger abstinence violation effect | Adding any violates P4 |
| DD-015 | Cumulative "moments stayed with" only | Self-efficacy without reset | None |
| DD-016 | After-using path hidden under "Something else" | Present for safety, not featured | Moving it up changes tone of outcome screen |
| DD-017 | `used` excluded from aggregates | Scope is the moment, not relapse tracking | Showing it reframes the app |
| DD-018 | Notifications only after user opts in per day | Unprompted pings can act as cues | Changing violates P7 |
| DD-019 | Neutral notification text, no user content | No cues on lock screen; server can't read data | Strings in SW kind map |
| DD-020 | Dark, desaturated palette; no pure black/white | Night use; reduced glare; calm | All in `tokens.css` |
| DD-021 | No red anywhere; notices use sand + icon + text | Red reads as alarm and failure | Token `--c-notice` |
| DD-022 | Intensity by position/number, not color ramp | Avoids alarm coding; accessible | `wave.js`, slider styles |
| DD-023 | System font + Dynamic Type | Native feel, respects user size, no font fetch | Swap `--font-*` tokens |
| DD-024 | Soft radii, no sharp corners | Calmer visual language | Radii tokens |
| DD-025 | 48px tap targets | Shaky hands, stress, night | `--tap-min` |
| DD-026 | No shadows; surface steps | Flat calm dark UI | Elevation tokens |
| DD-027 | Wave at ~6 breaths/min, long exhale | Slow paced breathing supports calm; doubles as urge-surfing visual | Wave tokens |
| DD-028 | Home button calm, bordered, not filled red/orange | A moment shouldn't feel like an alarm | Component class `.btn-moment` |
| DD-029 | 0–10 slider with anchor words | Standard craving scale; anchors aid consistency | Anchor map in `strings.js` |
| DD-030 | "Own words" sand style for user content | User's voice is visually distinct and trusted | Token `--c-sand` |
| DD-031 | Setup offered only in calm windows, never by push | Don't ask for reflection during crisis | Rules in `screens/home.js` |
| DD-032 | Check-in plan +30m/+2h/evening/morning, quiet hours shift later items | Covers the rest of a hard day without night pings | `schedule.js` |
| DD-033 | Seeking question as shadow-work stub | Builds pattern data for future reflective mode at low cost | Flag `shadowPrompt` |
| DD-034 | US crisis numbers, locale-keyed data | Owner is US; ship-ready structure | `content/resources.js` |
| DD-035 | Plain, nonjudgmental copy rules | Shame and praise both raise pressure | §12 |
