# Implementation Plan: LifeTrack App

## Overview

Implement the LifeTrack personal life tracking application using a React Native (Expo/TypeScript) mobile front-end backed by a Node.js/Express/TypeScript REST API, PostgreSQL for persistence, and Redis for sessions and queues. Tasks follow an incremental build-up: database schema → auth → trackers/entries → habits/streaks → goals → insights → notifications → exports → dashboard UI → onboarding flow.

## Tasks

- [ ] 1. Project setup and database schema
  - [x] 1.1 Initialise monorepo structure with `/api` (Node.js/Express/TypeScript) and `/mobile` (Expo/React Native/TypeScript) packages; configure `tsconfig.json`, ESLint, Prettier, and Jest + ts-jest with `fast-check`
    - Create directory tree, root `package.json` with workspaces, shared `tsconfig.base.json`
    - Install pinned dependencies: `express`, `pg`, `ioredis`, `bullmq`, `jsonwebtoken`, `bcrypt`, `fast-check`, `jest`, `ts-jest`, `supertest`, `knex`
    - Configure `jest.config.ts` with `fc.configureGlobal({ numRuns: 100 })` global setup
    - _Requirements: all_

  - [ ] 1.2 Create PostgreSQL migration files for all tables defined in the schema
    - Write `knex` migration for `users`, `categories`, `trackers`, `tracker_categories`, `entries`, `streaks`, `goals`, `insights`, `reminders`, `password_reset_tokens`
    - Add all indexes and constraints exactly as specified in the design (`UNIQUE`, `CHECK`, `REFERENCES ... ON DELETE CASCADE`)
    - _Requirements: 2.1, 3.1, 4.1, 5.1, 8.1, 9.1, 10.1_

  - [ ] 1.3 Write `knex` seed script that creates built-in Mood and Energy trackers for a given `userId`
    - Insert rows with `is_builtin = true`, `data_type = 'numeric'`, `valid_range = { min: 1, max: 10 }`
    - _Requirements: 7.1, 7.2_

- [ ] 2. Auth Service — registration, login, session management
  - [ ] 2.1 Implement `registerUser` function in `api/src/services/auth.service.ts`
    - Validate email format (RFC 5321, ≤ 254 chars) and password length (8–128)
    - Hash password with `bcrypt` (cost 12); insert into `users`; call seed script for builtin trackers
    - Issue JWT (15-min) + opaque refresh token stored in Redis with 30-day sliding TTL
    - Return `SessionTokens` or structured `ValidationError` / `ConflictError`
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ] 2.2 Write property test for registration validation (Property 1)
    - **Property 1: Valid registration creates an account**
    - **Validates: Requirements 1.1**
    - Use `arbitraryValidEmail()` and `arbitraryPassword(8, 128)` generators; assert `SessionTokens` returned and user row exists

  - [ ] 2.3 Write property test for password length rejection (Property 2)
    - **Property 2: Password length validation rejects out-of-range lengths**
    - **Validates: Requirements 1.3**
    - Generate passwords with `length < 8` or `length > 128`; assert `ValidationError` and no user row created

  - [ ] 2.4 Implement `loginUser`, `refreshSession`, and `logoutUser` in `auth.service.ts`
    - `loginUser`: verify bcrypt hash; issue new `SessionTokens`; generic error message on failure (Property 3)
    - `refreshSession`: validate refresh token in Redis; rotate token; reset 30-day TTL
    - `logoutUser`: delete refresh token from Redis
    - `sessionInactivity`: TTL-based expiry via Redis (30-day sliding window satisfies Req 1.6)
    - _Requirements: 1.4, 1.5, 1.6_

  - [ ] 2.5 Write property test for invalid credentials generic error (Property 3)
    - **Property 3: Invalid credentials produce a generic error**
    - **Validates: Requirements 1.5**
    - Generate wrong email/password pairs; assert error message does not mention which field failed


  - [ ] 2.6 Implement password reset flow in `auth.service.ts`
    - `requestPasswordReset`: check rate limit in Redis (max 3 per 60-min window per email); insert token into `password_reset_tokens`; enqueue email job
    - `confirmPasswordReset`: validate token not used and not expired; update password hash; set `used_at`
    - _Requirements: 1.7, 1.8, 1.9_

  - [ ] 2.7 Write property test for reset token single-use and expiry (Property 4)
    - **Property 4: Password reset token single-use and expiry enforcement**
    - **Validates: Requirements 1.8**
    - Generate tokens with `used_at` set or `expires_at < now()`; assert rejection and no password change

  - [ ] 2.8 Write property test for password reset rate limiting (Property 5)
    - **Property 5: Password reset rate limiting**
    - **Validates: Requirements 1.9**
    - Simulate 3 requests then an arbitrary number beyond; assert 4th+ requests are rejected with rate-limit error

  - [ ] 2.9 Add Express routes `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/password-reset`, `POST /auth/password-reset/confirm` in `api/src/routes/auth.router.ts`
    - Wire routes to service functions; attach JWT middleware for protected routes
    - _Requirements: 1.1–1.9_

- [ ] 3. Checkpoint — Auth layer
  - Ensure all auth unit, property, and integration tests pass. Ask the user if questions arise.

- [ ] 4. Tracker Engine — tracker CRUD and category management
  - [ ] 4.1 Implement `createTracker`, `listTrackers`, `updateTracker`, `archiveTracker`, `deleteTracker` in `api/src/services/tracker.service.ts`
    - Validate name (1–100 chars), `dataType`, `frequency`, `validRange`
    - Enforce 50-active-tracker limit on create; return `LimitError` when exceeded
    - `archiveTracker`: set `is_archived = true`; block delete while archived
    - `deleteTracker`: cascade delete only for non-archived trackers; prompt confirmation at route layer
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.9, 2.10_

  - [ ] 4.2 Write property test for cascade delete (Property 7)
    - **Property 7: Cascade delete removes tracker and all associated data**
    - **Validates: Requirements 2.7**
    - Use `arbitraryTracker()` with generated entry/goal sets; assert all rows removed after delete

  - [ ] 4.3 Add Express routes `POST /trackers`, `GET /trackers`, `PATCH /trackers/:id`, `POST /trackers/:id/archive`, `DELETE /trackers/:id` in `api/src/routes/tracker.router.ts`
    - Attach JWT auth middleware; validate request bodies
    - _Requirements: 2.1–2.10_


- [ ] 5. Entry logging and overwrite handling
  - [ ] 5.1 Implement `logEntry`, `listEntries`, `editEntry` in `api/src/services/entry.service.ts`
    - Validate value against `dataType` and `validRange`; return `ValidationError` for out-of-range
    - Enforce one-entry-per-tracker-per-local-day uniqueness; return `ConflictError` with `existingEntryId`
    - Handle `confirmOverwrite: true` → upsert with `edit_timestamp`
    - Truncate `note` to 500 chars server-side and flag truncation to caller (Property 9)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ] 5.2 Write property test for note truncation (Property 9)
    - **Property 9: Note truncation to exactly 500 characters**
    - **Validates: Requirements 3.8**
    - Generate notes with `length > 500`; assert stored note has exactly 500 chars and truncation flag is set

  - [ ] 5.3 Write property test for tracker config immutability of historical entries (Property 6)
    - **Property 6: Tracker config update does not mutate historical entries**
    - **Validates: Requirements 2.4**
    - Generate tracker + entries; update tracker config; re-fetch entries and assert all fields unchanged

  - [ ] 5.4 Add Express routes `POST /trackers/:id/entries`, `GET /trackers/:id/entries`, `PATCH /trackers/:id/entries/:eid` in `api/src/routes/entry.router.ts`
    - _Requirements: 3.1–3.9_

- [ ] 6. Habit streak calculation
  - [ ] 6.1 Implement `recalculateStreak` in `api/src/services/streak.service.ts`
    - On entry save, compute current streak (longest suffix of consecutive completed scheduled days) and longest historical streak; upsert `streaks` table row within 1 second
    - Apply grace-period logic: skip one missed day per rolling 7-day window if `graceEnabled`
    - Mark missed days at 23:59 local time via a scheduled BullMQ job
    - _Requirements: 4.1, 4.2, 4.3, 4.6_

  - [ ] 6.2 Write property test for streak calculation (Property 10)
    - **Property 10: Streak calculation matches consecutive scheduled completions**
    - **Validates: Requirements 4.1, 4.2**
    - Use `arbitraryEntrySequence(tracker, length)` generator; assert current and longest streak values match expected counts

  - [ ] 6.3 Implement milestone detection and notification enqueueing in `streak.service.ts`
    - After streak update, check if new value is 7, 30, 66, or 100; if so, enqueue congratulatory BullMQ notification job with ≤ 5-min delay
    - _Requirements: 4.5_

  - [ ] 6.4 Write property test for milestone notification enqueueing (Property 11)
    - **Property 11: Milestone notifications triggered at correct streak values**
    - **Validates: Requirements 4.5**
    - Simulate streak transitions to milestone values; assert notification job enqueued within expected delay


- [ ] 7. Checkpoint — Tracker, entry, and streak layer
  - Ensure all tracker, entry, and streak tests pass. Ask the user if questions arise.

- [ ] 8. Goal Engine
  - [ ] 8.1 Implement `createGoal`, `listGoals`, `updateGoal` in `api/src/services/goal.service.ts`
    - Validate required fields: `trackerId`, `targetValue`, `direction`, `deadline` (must be future date)
    - `listGoals`: return goals grouped as `{ active, completed, expired }`
    - `updateGoal`: recalculate `progress_pct` immediately when target or deadline changes
    - _Requirements: 5.1, 5.2, 5.7, 5.8_

  - [ ] 8.2 Implement `updateGoalProgress` hook called by entry service after each entry save
    - Ascending: `clamp((sum / target) * 100, 0, 100)`; descending: `clamp((1 - latest / target) * 100, 0, 100)`
    - Mark `status = 'completed'` when `progress_pct = 100`; enqueue congratulatory notification
    - Mark `status = 'expired'` via scheduled job when deadline passes with `progress_pct < 100`
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.9_

  - [ ] 8.3 Write property test for goal progress formulas (Property 8)
    - **Property 8: Goal progress formula correctness**
    - **Validates: Requirements 5.3, 5.9**
    - Use `arbitraryGoal(tracker)` for both directions; assert stored `progress_pct` matches formula for arbitrary entry sequences

  - [ ] 8.4 Add Express routes `POST /goals`, `GET /goals`, `PATCH /goals/:id` in `api/src/routes/goal.router.ts`
    - _Requirements: 5.1–5.9_

- [ ] 9. Insight Engine and background workers
  - [ ] 9.1 Implement `calculateTrend` in `api/src/services/insight.service.ts`
    - Linear regression over the most recent 14 entries for a tracker
    - Classify direction: slope > 0.05 → `improving`; −0.05 to 0.05 → `stable`; < −0.05 → `declining`
    - Require ≥ 14 entries; return `null` (no insight) when fewer entries exist
    - _Requirements: 9.1, 9.5, 9.6_

  - [ ] 9.2 Write property test for trend insight classification (Property 15)
    - **Property 15: Trend insight classification matches regression slope**
    - **Validates: Requirements 9.1, 9.5**
    - Generate entry sequences with known slopes; assert classification matches thresholds

  - [ ] 9.3 Write property test for insufficient data suppression (Property 17)
    - **Property 17: Insufficient data suppresses trend insight**
    - **Validates: Requirements 9.6**
    - Generate trackers with `length < 14` entries; assert no insight generated

  - [ ] 9.4 Implement `calculateCorrelation` in `insight.service.ts`
    - Compute Pearson r over shared entry days for all numeric tracker pairs with ≥ 30 shared days
    - Surface correlation insight when `|r| ≥ 0.5`
    - _Requirements: 9.4_

  - [ ] 9.5 Write property test for correlation threshold (Property 16)
    - **Property 16: Correlation insight surfaced at or above threshold**
    - **Validates: Requirements 9.4**
    - Generate tracker pairs with synthetic r values; assert insight surfaced iff `|r| ≥ 0.5`

  - [ ] 9.6 Implement BullMQ `InsightWorker` in `api/src/workers/insight.worker.ts`
    - Process insight-recalc jobs; call `calculateTrend` and `calculateCorrelation`; upsert `insights` table; enforce ≤ 24-hour SLA by job delay config
    - _Requirements: 9.2_

  - [ ] 9.7 Add Express route `GET /insights` in `api/src/routes/insight.router.ts`
    - Return insights ordered by `generated_at DESC`
    - _Requirements: 9.3_


- [ ] 10. Notification Service and reminder workers
  - [ ] 10.1 Implement `createReminder`, `listReminders`, `updateReminder`, `deleteReminder`, `setGlobalEnabled` in `api/src/services/notification.service.ts`
    - Persist to `reminders` table; support global enable/disable flag per user
    - _Requirements: 8.1, 8.4_

  - [ ] 10.2 Implement BullMQ `NotifWorker` in `api/src/workers/notif.worker.ts`
    - Schedule jobs for each reminder config; at fire time, check if today's entry already exists (suppression rule); deliver FCM/APNs push otherwise
    - For offline delivery: re-check entry suppression on device reconnect before delivering
    - _Requirements: 8.2, 8.3, 8.5_

  - [ ] 10.3 Write property test for reminder suppression when entry exists (Property 14)
    - **Property 14: Reminder suppression when today's entry exists**
    - **Validates: Requirements 8.3**
    - For arbitrary tracker + entry submitted for current day; assert notification job is not dispatched

  - [ ] 10.4 Add Express routes `POST /reminders`, `GET /reminders`, `PATCH /reminders/:id`, `DELETE /reminders/:id`, `PATCH /reminders/global` in `api/src/routes/reminder.router.ts`
    - _Requirements: 8.1–8.5_

- [ ] 11. Export Service
  - [ ] 11.1 Implement `generateExport` in `api/src/services/export.service.ts`
    - Accept `ExportRequest` (format, trackerId?, startDate?, endDate?)
    - Apply date-range filter (Property 18); enforce `local_date ∈ [S, E]`
    - For ≤ 10 000 entries: generate synchronously, upload to object storage, return `ExportResult` immediately
    - For > 10 000 entries: enqueue `ExportWorker` job, return `{ jobId }`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ] 11.2 Write property test for export date range filter (Property 18)
    - **Property 18: Export date range filter correctness**
    - **Validates: Requirements 10.2**
    - Generate arbitrary entry sets with arbitrary date ranges; assert every row in output has `local_date ∈ [S, E]`

  - [ ] 11.3 Implement CSV serialiser in `export.service.ts`
    - Columns: Tracker name, Entry date (ISO 8601), Entry value, Entry note, Category
    - Empty dataset: write header row only and set `entryCount = 0`
    - _Requirements: 10.5, 10.8_

  - [ ] 11.4 Write property test for CSV required columns (Property 19)
    - **Property 19: CSV export contains all required columns**
    - **Validates: Requirements 10.5**
    - Generate non-empty entry sets; parse CSV output; assert all required columns are non-null in every row

  - [ ] 11.5 Implement JSON serialiser and re-import parser in `export.service.ts`
    - Serialise to JSON array matching `Entry` shape
    - Empty dataset: write `[]`
    - Re-import path: parse JSON array and upsert entries; verify round-trip invariant (Property 20)
    - _Requirements: 10.6, 10.7, 10.8_

  - [ ] 11.6 Write property test for JSON round-trip (Property 20)
    - **Property 20: JSON export round-trip preserves all entry fields**
    - **Validates: Requirements 10.7**
    - Use `arbitraryEntry(tracker)` to generate valid entries; export then re-import; assert all fields identical

  - [ ] 11.7 Write property test for empty export structure (Property 21)
    - **Property 21: Empty export produces correct empty structure**
    - **Validates: Requirements 10.8**
    - Generate filter criteria matching zero entries; assert CSV has header-only or JSON is `[]`

  - [ ] 11.8 Implement `ExportWorker` in `api/src/workers/export.worker.ts`
    - Process large-export jobs; write to object storage; update export record; notify user on completion or failure
    - On failure: mark record `failed`; clean up partial objects; return structured error
    - _Requirements: 10.4, 10.9_

  - [ ] 11.9 Add Express routes `POST /exports`, `GET /exports/:jobId` in `api/src/routes/export.router.ts`
    - _Requirements: 10.1–10.9_

- [ ] 12. Checkpoint — Goal, insight, notification, and export layer
  - Ensure all service tests pass and BullMQ workers process jobs correctly. Ask the user if questions arise.


- [ ] 13. React Native mobile app — navigation and shared hooks
  - [ ] 13.1 Set up Expo project in `/mobile` with TypeScript; configure React Navigation (bottom tabs + stack navigator); create placeholder screens for Dashboard, Goals, Insights, Export, Settings
    - Install pinned deps: `react-navigation`, `expo-notifications`, `@tanstack/react-query`, `axios`
    - Create `api.client.ts` wrapping `axios` with JWT interceptor and token-refresh logic
    - _Requirements: 6.1, 11.1_

  - [ ] 13.2 Implement authentication screens: `RegisterScreen`, `LoginScreen`, `ForgotPasswordScreen`
    - Wire to `Auth_Service` endpoints; store `SessionTokens` in `expo-secure-store`
    - Navigate to Dashboard on success; show field-level validation errors
    - _Requirements: 1.1, 1.3, 1.5, 1.7_

- [ ] 14. Dashboard screen
  - [ ] 14.1 Implement `DashboardScreen` in `mobile/src/screens/DashboardScreen.tsx`
    - Fetch active trackers; render `TrackerCard` per tracker showing name, latest entry value, current streak (habit trackers), goal progress %
    - Show "pending entry" badge indicator on cards where today's entry is missing
    - Navigate to Dashboard within 2 s of login (use `react-query` prefetch on login success)
    - _Requirements: 6.1, 6.2, 6.6_

  - [ ] 14.2 Implement chart view component `TrackerChart.tsx`
    - Time-range selector (7d / 30d / 90d / 12m); line chart for numeric trackers; bar chart for boolean trackers
    - Render updated chart within 1 s of range selection; show empty-state message when no entries in range
    - _Requirements: 6.3, 6.4, 6.5, 6.8_

  - [ ] 14.3 Implement weekly mood trend chart component `MoodTrendChart.tsx`
    - Show average mood value per day for past 7 days; zero/placeholder for missing days
    - _Requirements: 7.4_

  - [ ] 14.4 Write property test for weekly trend chart average (Property 12)
    - **Property 12: Weekly trend chart average calculation**
    - **Validates: Requirements 7.4, 7.6**
    - Generate sets of daily mood/energy entries; assert chart data point equals arithmetic mean per day

  - [ ] 14.5 Implement weekly energy trend chart component `EnergyTrendChart.tsx` (mirrors `MoodTrendChart.tsx`)
    - _Requirements: 7.6_

  - [ ] 14.6 Implement low-mood supportive message component `LowMoodBanner.tsx`
    - Show when mood entry value ≤ 3: display ≤ 50-word message and well-being resource link in single UI element
    - Hide entirely for mood value ≥ 4
    - _Requirements: 7.5_

  - [ ] 14.7 Write property test for low-mood trigger (Property 13)
    - **Property 13: Low mood entry triggers supportive content**
    - **Validates: Requirements 7.5**
    - Generate mood values 1–10; assert banner shown iff value ≤ 3, word count ≤ 50, link present


- [ ] 15. Tracker and entry screens
  - [ ] 15.1 Implement `TrackerListScreen`, `CreateTrackerScreen`, `EditTrackerScreen` in `mobile/src/screens/`
    - Form fields: name, data type, unit, frequency, valid range, categories, isHabit, graceEnabled
    - Show active-tracker-limit error when creating beyond 50
    - _Requirements: 2.1, 2.2, 2.3, 2.9, 2.10_

  - [ ] 15.2 Implement `LogEntryScreen` in `mobile/src/screens/LogEntryScreen.tsx`
    - Render input appropriate for data type (numeric/boolean/text)
    - Show overwrite confirmation modal when ConflictError returned; handle confirm/cancel
    - Show note-truncation warning when truncation flag set by API
    - _Requirements: 3.1–3.8_

- [ ] 16. Goals, Insights, and Export screens
  - [ ] 16.1 Implement `GoalsScreen` with `ActiveGoals`, `CompletedGoals`, `ExpiredGoals` sections; `CreateGoalScreen`; `EditGoalScreen`
    - Validate future deadline on client before submitting
    - _Requirements: 5.1, 5.2, 5.7, 5.8_

  - [ ] 16.2 Implement `InsightsScreen` in `mobile/src/screens/InsightsScreen.tsx`
    - Display insights ordered by `generatedAt DESC`; show "more data needed" message for trackers with < 14 entries
    - _Requirements: 9.3, 9.6_

  - [ ] 16.3 Implement `ExportScreen` in `mobile/src/screens/ExportScreen.tsx`
    - Format selector (CSV/JSON), tracker selector, date-range pickers
    - For large exports: show "processing" state and poll `GET /exports/:jobId`
    - Show empty-export message when API returns `entryCount = 0`
    - _Requirements: 10.1–10.9_

- [ ] 17. Onboarding flow
  - [ ] 17.1 Implement `OnboardingNavigator` and screens (`WelcomeScreen`, `TemplateSelectionScreen`, `TrackerEditScreen`, `CompletionScreen`) in `mobile/src/screens/onboarding/`
    - Max 5 steps; "Skip" button on every step navigates to Dashboard
    - On final step completion: navigate to Dashboard
    - _Requirements: 11.1, 11.4, 11.5_

  - [ ] 17.2 Implement template-based tracker creation in `TemplateSelectionScreen`
    - Fetch ≥ 5 pre-built templates; allow multi-select limited to remaining capacity under 50-tracker limit
    - On select: call `POST /trackers`; show pre-populated editable form
    - On re-run (from settings): create new tracker even if template already used
    - _Requirements: 11.2, 11.3, 11.6, 11.7_

  - [ ] 17.3 Write property test for onboarding template defaults (Property 22)
    - **Property 22: Onboarding template creates tracker with correct defaults**
    - **Validates: Requirements 11.3**
    - For each template, assert created tracker fields match template defaults exactly

  - [ ] 17.4 Write property test for re-selecting template creates new tracker (Property 23)
    - **Property 23: Re-selecting existing template creates a new tracker**
    - **Validates: Requirements 11.6**
    - Select template T; re-run onboarding and select T again; assert two distinct tracker rows exist

  - [ ] 17.5 Write property test for active tracker limit during batch selection (Property 24)
    - **Property 24: Active tracker limit enforced during onboarding batch selection**
    - **Validates: Requirements 11.7, 2.10**
    - Generate users with N active trackers (0 ≤ N ≤ 50); select K templates; assert `min(K, 50−N)` created and excess rejected

- [ ] 18. Checkpoint — Mobile UI
  - Ensure all mobile screens render correctly and all property/unit tests pass. Ask the user if questions arise.


- [ ] 19. Error handling middleware and structured error responses
  - [ ] 19.1 Implement global Express error handler in `api/src/middleware/errorHandler.ts`
    - Map service errors to HTTP status codes and JSON envelopes defined in the design (400, 401, 404, 409, 429, 500)
    - Attach correlation IDs to 500 errors; never leak stack traces
    - _Requirements: 1.2, 1.3, 1.5, 2.2, 2.10, 3.2, 5.2_

- [ ] 20. Integration tests
  - [ ] 20.1 Write integration test for Auth flow (register → login → refresh → logout)
    - Run against real PostgreSQL + Redis (Docker Compose); assert full `SessionTokens` lifecycle
    - _Requirements: 1.1, 1.4, 1.6_

  - [ ] 20.2 Write integration test for Tracker and Entry end-to-end (create tracker → log entry → streak update)
    - _Requirements: 2.1, 3.1, 3.9, 4.1_

  - [ ] 20.3 Write integration test for Export Service (generate CSV and JSON with 1, 100, 1 000 entries; verify timing SLAs)
    - Assert ≤ 10 s for ≤ 10 000 entries
    - _Requirements: 10.3, 10.5, 10.7_

  - [ ] 20.4 Write integration test for Notification Service (reminder scheduling, suppression on entry submit, offline delivery)
    - _Requirements: 8.2, 8.3, 8.5_

- [ ] 21. Final checkpoint — Full test suite
  - Ensure all property, unit, and integration tests pass, CI is green. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at every major layer boundary
- Property tests use `fast-check` with `fc.configureGlobal({ numRuns: 100 })`; generators live in `src/__tests__/properties/generators.ts`
- Unit and integration tests use `Jest` + `ts-jest` + `supertest`
- Integration tests require `TEST_DB_URL` and `TEST_REDIS_URL` environment variables


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "13.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 4, "tasks": ["2.5", "2.6"] },
    { "id": 5, "tasks": ["2.7", "2.8", "2.9", "4.1"] },
    { "id": 6, "tasks": ["4.2", "4.3", "5.1", "8.1"] },
    { "id": 7, "tasks": ["5.2", "5.3", "5.4", "8.2"] },
    { "id": 8, "tasks": ["6.1", "8.3", "8.4"] },
    { "id": 9, "tasks": ["6.2", "6.3"] },
    { "id": 10, "tasks": ["6.4", "9.1", "10.1"] },
    { "id": 11, "tasks": ["9.2", "9.3", "9.4", "10.2"] },
    { "id": 12, "tasks": ["9.5", "9.6", "10.3"] },
    { "id": 13, "tasks": ["9.7", "11.1", "10.4"] },
    { "id": 14, "tasks": ["11.2", "11.3"] },
    { "id": 15, "tasks": ["11.4", "11.5", "13.2"] },
    { "id": 16, "tasks": ["11.6", "11.7", "11.8", "14.1"] },
    { "id": 17, "tasks": ["11.9", "14.2", "14.3"] },
    { "id": 18, "tasks": ["14.4", "14.5", "15.1"] },
    { "id": 19, "tasks": ["14.6", "14.7", "15.2"] },
    { "id": 20, "tasks": ["16.1", "16.2", "16.3"] },
    { "id": 21, "tasks": ["17.1"] },
    { "id": 22, "tasks": ["17.2"] },
    { "id": 23, "tasks": ["17.3", "17.4", "17.5"] },
    { "id": 24, "tasks": ["19.1"] },
    { "id": 25, "tasks": ["20.1", "20.2", "20.3", "20.4"] }
  ]
}
```
