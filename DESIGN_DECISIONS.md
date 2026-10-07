# Design decisions

Format: `DD-### | Decision | Why | Override impact`. Code references these ids in comments (e.g. `/* DD-014 */`).
DD-001–DD-035 are the seed from the spec (Appendix A). DD-036 onward were made during the build where the spec was silent.

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
| DD-036 | Worker keeps a tiny `kv` table (last housekeeping date) | "First run after 03:00 UTC" needs memory across cron runs | `schema.sql`, `checkins.js` |
| DD-037 | Sync and push stay off until `API_BASE` and `VAPID_PUBLIC_KEY` are set in `config.js` | The app is fully usable offline-only before the backend exists | `BACKEND_CONFIGURED` in `config.js` |
| DD-038 | Built-in list items have stable ids (`d-shower`, `t-tired`, `p-once`) and are seeded with `updatedAt: 0`, not synced until changed | Two devices restoring defaults converge instead of duplicating; any synced copy beats a fresh seed | `content/defaults.js`, `seedDefaults()` |
| DD-039 | `profile.thoughtsReviewed` flag added | Setup item "thoughts" needs a completion signal; there is nothing else to measure | `PROFILE_DEFAULTS`, `home.js nextSetupItem()` |
| DD-040 | Cumulative count excludes moments with outcome `used` | §10.4 says `used` is never counted in any aggregate; editing an outcome to `used` can lower the count (accepted edge case) | `cumulativeCount()` |
| DD-041 | LWW tie (equal `updatedAt`) goes to the higher writer device id, stamped on every synced record as `writer` | Spec's "higher id" can't separate two versions of the same record; device id is deterministic on every replica | `shouldApply()` in `lib/sync.js` |
| DD-042 | Moment record carries extra bookkeeping: `lastRoute`, `delayExtraMin`, `risingShownAt`, `longShown`, `closeStage`, `closeHadTriggers` | Resume at the exact screen (E1), "Keep surfing", rule rate limits, and a resumable close all need state in IDB, not memory | `startMoment()` in `state.js` |
| DD-043 | Guidance auto-advance pauses only while a control has keyboard/assistive focus (`:focus-visible`) | Taps focus the slider on some browsers; pausing on every tap would freeze guidance for touch users | `screens/surf.js` |
| DD-044 | Look back count sections (When, triggers, body, Decide, seeking) need ≥3 moments; wave overlay needs ≥3 eligible; others follow §10 | Avoids "patterns" from one or two data points | `MIN_FOR_COUNTS` in `screens/lookback.js` |
| DD-045 | Sheet scrim token `--c-scrim` and heat-grid shading tokens `--c-heat-1…4` (one hue, opacity steps, numbers always shown) | Needed values not in §13.1; kept within the accent hue so no alarm colors appear | `tokens.css` |
| DD-046 | Settings has a "paste a restore link" field | iOS Home Screen apps have separate storage from Safari and no address bar, so a tapped link would restore into the wrong place | `screens/settings.js`, `strings.restore.iosNote` |
| DD-047 | At the check-in offer, "In 10 min" schedules one check-in only; "Also in 10 min" adds one to an active plan | Matches the plain meaning of the button; "Yes" is the full plan | `screens/close.js` |
| DD-048 | Checking out an unfinished moment keeps its `endedAt`, records any new rating at its real time, and skips the check-in offer step (After-using still offers "Check on me later") | The day has moved on; durations stay true; safety follow-up stays available | `screens/close.js` |
| DD-049 | "Home" on After-using closes the moment | It's the last step the person chose; leaving it active would resume it later | `screens/after.js` |
| DD-050 | Tape notes are stored as a 4-slot string array, or `null` when nothing was written | Keeps answers aligned with the four prompts | `screens/tape.js` |
| DD-051 | A slider rating commits 700 ms after the last change, or on pointer up; tapping anywhere on the track sets a value | One drag = one rating; iOS doesn't move range thumbs on track taps | `ui/slider.js` |
| DD-052 | "Setup card not already shown today" = shown during the first app session of the day; it stays for that session until "Not now" | Without this, the card would vanish on the next render | `screens/home.js` |
| DD-053 | In-app delivery shows only the latest due check-in; older ones in the 3 h window are marked expired | One question at a time (P2) | `findDueCheckin()` |
| DD-054 | On Doing, the return rating is saved with an explicit button; "Skip" still records the return time | Lets the person settle on a number before it's recorded | `screens/doing.js` |
| DD-055 | The close rating is recorded on Next, not on every slider change | Same reason as DD-054 | `screens/close.js` |
| DD-056 | Deleting a synced record leaves a minimal tombstone (`id`, `createdAt`, `deleted`) | Deleted content shouldn't linger locally or on the server | `db.remove()` |
| DD-057 | Service worker update reloads only when replacing an existing controller, and only when no moment is active | First install also fires `controllerchange`; a reload then would interrupt the first launch | `registerSW()` in `app.js` |
| DD-058 | Crossfade starts via a forced reflow, not `requestAnimationFrame` | rAF is throttled in some contexts, which left new screens invisible | `swap()` in `app.js` |
| DD-059 | "Something else" in Distract saves the new option as Mind / low energy | No extra questions mid-moment; editable in My lists | `screens/distract.js` |
| DD-060 | Recent moments lists every finished moment without outcome labels, so a `used` moment's detail stays reachable for editing (E10) | §10.4 forbids labeling, not reaching the detail | `screens/lookback.js` |
| DD-061 | Worker sends CORS headers only to `ALLOWED_ORIGIN`; other origins get none | The browser then blocks them | `worker/src/index.js` |
| DD-062 | Device ids are lowercased at registration and in auth | Avoids case-variant duplicates | `worker/src/auth.js` |
| DD-063 | Record and check-in ids must match `[A-Za-z0-9_-]{1,64}` | Bounded, URL-safe keys; UUIDs and built-in ids fit | `worker/src/util.js` |
| DD-064 | Sync pull is paginated at 500 rows with `more: true` | Keeps each invocation inside CPU and response limits; client loops | `worker/src/sync.js`, `lib/sync.js` |
| DD-065 | Live records must carry `iv` + `ct`; tombstones may omit them | Rejects malformed writes | `worker/src/sync.js` |
| DD-066 | One seq number is reserved per incoming change, even if it loses LWW (gaps allowed) | The whole sync is 3 D1 statements in one batch regardless of size | `worker/src/sync.js` |
| DD-067 | At most 5 push subscriptions per identity; oldest evicted | Keeps cron fetches under the 50-subrequest cap | `worker/src/push.js` |
| DD-068 | Re-PUT of an endpoint by another identity moves it to that identity | e.g. after a restore in the same browser | `worker/src/push.js` |
| DD-069 | Check-in ack is idempotent and returns 204 even for unknown ids | In-app answers never produce client errors | `worker/src/checkins.js` |
| DD-070 | Cron only selects due items whose device has a push subscription, or items old enough to expire | In-app-only devices would otherwise fill LIMIT 3 and delay other devices | `worker/src/checkins.js` |
| DD-071 | Other non-2xx push responses and network errors also count as attempts | Prevents endless retries on misconfigured endpoints | `worker/src/checkins.js` |
| DD-072 | Daily housekeeping also drops expired `vapid_cache` rows | Keeps the table small | `worker/src/checkins.js` |
| DD-073 | Restore verifies the identity with the server before changing anything locally | E21: a bad or unreachable link changes no data | `screens/restore.js` |
| DD-074 | Export contains every store except `meta.secret` and the internal sync queue | §6.11; the queue is an implementation detail | `screens/settings.js` |
| DD-075 | The spec's iOS "turn on in iOS Settings" text is shown for any denied permission | One fix path; the owner's platform is iOS | `screens/settings.js` |
| DD-076 | Dismissing the "didn't get a check-out" line is remembered per moment id | A later unfinished moment still gets offered | `screens/home.js` |
| DD-077 | A quota error mid-session switches to memory mode and carries current data over, with the persistent banner | E19 without losing the session's work | `db.fallbackToMemory()` |
| DD-078 | The Worker prefixes `mailto:` to `VAPID_SUBJECT` when it has no scheme | Apple's push service rejects a bare email as the VAPID subject; avoids a silent push failure from a common setup slip | `normalizeSubject()` in `worker/src/webpush.js` |
| DD-079 | Long screens show a bottom fade + down chevron only while content continues below the fold; tapping the chevron scrolls ~70% of a screen | Nothing else signaled that a screen scrolls; kept minimal and token-driven (`--scroll-hint-h`, `.scroll-hint`) so the design layer can restyle or replace it | `ui/scrollhint.js`, `.scroll-hint` in `components.css` |
| DD-080 | Updates are prompted, not silent: the app checks for a new version on launch, on return, and hourly; a waiting version shows "A new version of Moment is ready. [Update] [Later]". Never shown or applied during a moment. "Later" hides it until next launch. Replaces DD-057's silent switch at launch | The person decides when the app reloads; nobody keeps running a stale version without knowing | `services/updates.js`, `renderBanners()` in `app.js` |
| DD-081 | Five alternate breathing visuals (Silk, Ink, Shallows, Pendulum, Murmuration) beside the original Wave, all driven by the same breath curve; chosen in Settings → Motion (default Wave) or `?breath=<id>`; reviewed side by side at `/lab/` and on the Design canvas in `DESIGN_QUEUE.md`. WebGL ones fall back to Wave when WebGL is unavailable; all draw a still frame under reduced motion | Exploration for the design pass; the Wave stays default until one is chosen | `web/js/ui/breath/`, `settings.breathVisual` |
| DD-082 | Breathing visual adds Random and Cycling, both chosen once per moment: Random picks any of the six; Cycling gives each new moment the next one in turn (position kept in `meta.breathCycle`). The pick is stored on the moment, so Surf, Doing and a resumed moment stay consistent | Keeps the visual fresh across moments without switching mid-moment | `pickVisualForMoment()` / `resolveVisual()` in `ui/breath/index.js`, `startMoment()` in `state.js` |
| DD-083 | The tide replaces the slider and wave on Start, Distance, Surf, Distract and Doing: one persistent WebGL layer whose waterline is the 0–10 rating; drag to rate | One continuous object across screens; rating becomes a physical gesture; supersedes DD-029's slider and DD-054's save button on these screens | `ui/tide/water.js`; screens call `setWaterScreen` / `enableGrab` |
| DD-084 | PT Sans for body and all numbers, Ovo for titles, guidance and labels; self-hosted woff2 | Owner choice; self-hosting keeps the no-third-party rule and offline use. Supersedes DD-023 (Dynamic Type still applies via `-apple-system-body` sizing) | `--font-body`, `--font-display` in tokens.css |
| DD-085 | Water style Glass / Storm / Boil, chosen per moment by Random or Cycling (default Cycling), stored on `moment.waterStyle`, `?water=<id>` override | Same pattern as DD-082; keeps the water fresh without switching mid-moment | `ui/tide/styles.js`, `settings.waterStyle` |
| DD-086 | The water level breathes at the wave pace; the breath amp differs per screen and fades out while grabbing | The Surf line "breathe with the wave" needs the water to visibly rise and fall | `breath` values in `SCREENS` (water.js) |
| DD-087 | Storm chop and Boil bubbles scale with the level | Higher ratings look and feel rougher; intensity is still also shown by number and position (DD-022) | `k` in `shaders.js` |
| DD-088 | The six breathing visuals live inside the water: Wave = the water alone; the other five render on a square layer centred in the water body, scaled to fit, clipped to the live waterline each frame and screen-blended into the tide. Strength per screen (Distract 0.22 … Surf 0.7), soft radial edge. Still chosen per moment by the Breathing visual setting (DD-082) | Keeps all six alive in the tide design without a second surface or competing with the rating; they rise, fall and slosh with the water | `ui/tide/inwater.js` (`STRENGTH`), `onWaterFrame` in water.js |
