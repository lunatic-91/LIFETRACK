# Requirements Document

## Introduction

LifeTrack is a personal life tracking application that helps individuals monitor and improve multiple dimensions of their daily life — including habits, mood, health metrics, goals, and time use. The app provides a unified dashboard to visualize progress over time, send smart reminders, and generate actionable insights. It is designed for individual use, with a focus on simplicity, consistency, and motivation.

## Glossary

- **User**: A registered individual using the LifeTrack application
- **Habit**: A recurring behavior the User wants to build or break, tracked on a daily or custom schedule
- **Entry**: A single recorded instance of a tracked item (mood, habit completion, health metric, etc.)
- **Tracker**: A configurable unit representing one dimension of life to monitor (e.g., mood, sleep, water intake)
- **Goal**: A User-defined target associated with a Tracker, with a defined deadline and measurable criterion
- **Dashboard**: The main screen displaying an overview of all active Trackers and recent progress
- **Streak**: A consecutive sequence of days on which the User has completed a given Habit
- **Insight**: An automatically generated summary or observation derived from User data trends
- **Reminder**: A scheduled notification sent to the User to prompt an Entry or Habit check-in
- **Category**: A grouping label applied to Trackers for organizational purposes (e.g., Health, Work, Mindset)
- **App**: The LifeTrack application
- **Auth_Service**: The component responsible for User authentication and session management
- **Tracker_Engine**: The component responsible for creating, updating, and evaluating Trackers and Entries
- **Goal_Engine**: The component responsible for tracking progress toward User-defined Goals
- **Insight_Engine**: The component responsible for analyzing Entry data and generating Insights
- **Notification_Service**: The component responsible for scheduling and delivering Reminders
- **Export_Service**: The component responsible for exporting User data to external formats

---

## Requirements

### Requirement 1: User Registration and Authentication

**User Story:** As a new User, I want to register and log in securely, so that my personal data is protected and accessible only to me.

#### Acceptance Criteria

1. WHEN a User submits an email address that matches the format of a non-empty local part, a single `@` symbol, and a non-empty domain with at least one `.` separator (max 254 characters total), and a password between 8 and 128 characters, THE Auth_Service SHALL create a new account and issue an authenticated session.
2. WHEN a User submits an email address that is already registered, THE Auth_Service SHALL return an error message indicating the email is already in use.
3. WHEN a User submits a password shorter than 8 characters or longer than 128 characters, THE Auth_Service SHALL return a validation error specifying the minimum and maximum length requirements.
4. WHEN a registered User submits valid credentials, THE Auth_Service SHALL issue an authenticated session within 5 seconds.
5. WHEN a User submits invalid credentials, THE Auth_Service SHALL return an error message within 1 second without revealing whether the email or the password was incorrect, and SHALL invalidate any session token issued during that request.
6. WHEN an authenticated session has been inactive for 30 days, THE Auth_Service SHALL invalidate the session and require re-authentication.
7. WHEN a User requests a password reset, THE Auth_Service SHALL send a reset link to the registered email address within 60 seconds.
8. IF a password reset link is used more than once or has been inactive for more than 24 hours, THEN THE Auth_Service SHALL reject the request and prompt the User to request a new link.
9. IF a User requests more than 3 password reset links within a 60-minute window, THEN THE Auth_Service SHALL reject subsequent reset requests for that email address until the window expires and return an error message indicating the limit has been reached.

---

### Requirement 2: Tracker Management

**User Story:** As a User, I want to create and manage custom Trackers, so that I can monitor the life dimensions that matter most to me.

#### Acceptance Criteria

1. WHEN a User submits a request to create a Tracker with a name of 1–100 characters, an optional Category, a unit of measurement, and a tracking frequency of daily, weekly, or custom (minimum interval of 1 day), THE Tracker_Engine SHALL create and persist the Tracker.
2. WHEN a User submits a request to create a Tracker without a name, THE Tracker_Engine SHALL return a validation error requiring a name.
3. THE Tracker_Engine SHALL allow a User to assign a Tracker to one or more Categories at any time after creation.
4. WHEN a User updates a Tracker's configuration, THE Tracker_Engine SHALL apply the changes to future Entries without modifying historical Entries.
5. WHEN a User archives a Tracker, THE Tracker_Engine SHALL hide it from the Dashboard while preserving all associated Entries and Goals.
6. WHILE a Tracker is archived, THE App SHALL disable the delete option for that Tracker.
7. WHEN a User deletes a non-archived Tracker, THE Tracker_Engine SHALL permanently remove the Tracker and all associated Entries and Goals after the User confirms the deletion.
8. THE Tracker_Engine SHALL support at least the following data types for Tracker values: numeric (integer or decimal), boolean (yes/no), and text (free text up to 500 characters).
9. THE App SHALL allow a User to have up to 50 active Trackers simultaneously.
10. WHEN a User attempts to create a Tracker and the User already has 50 active Trackers, THE Tracker_Engine SHALL reject the request and return an error message indicating the active Tracker limit has been reached.

---

### Requirement 3: Daily Entry Logging

**User Story:** As a User, I want to log daily Entries for my Trackers, so that I can build an accurate record of my behavior and progress.

#### Acceptance Criteria

1. WHEN a User submits an Entry for a Tracker, THE Tracker_Engine SHALL record the Entry with a timestamp accurate to the minute in the User's local time zone.
2. WHEN a User submits an Entry with a value outside the Tracker's defined valid range, THE Tracker_Engine SHALL return a validation error specifying the accepted range.
3. THE Tracker_Engine SHALL allow a User to submit at most one Entry per Tracker per User's local calendar day for daily-frequency Trackers.
4. WHEN a User submits an Entry for the same Tracker on the same User's local calendar day as an existing Entry and the User confirms the overwrite, THE Tracker_Engine SHALL replace the existing Entry's value with the new value and record the edit timestamp alongside the original timestamp.
5. WHEN a User submits an Entry for the same Tracker on the same User's local calendar day as an existing Entry and the User cancels the overwrite, THE Tracker_Engine SHALL discard the new submission and preserve the existing Entry unchanged.
6. WHEN a User edits a past Entry, THE Tracker_Engine SHALL update the stored value and record the edit timestamp alongside the original timestamp.
7. THE Tracker_Engine SHALL allow a User to add an optional text note to any Entry.
8. WHEN a User submits an Entry with a note exceeding 500 characters, THE Tracker_Engine SHALL truncate the note to exactly 500 characters, notify the User that the note was shortened, and save the Entry with the truncated note.
9. WHEN an Entry is saved successfully, THE Tracker_Engine SHALL update the Streak count for the associated Habit Tracker within 1 second.

---

### Requirement 4: Habit Tracking and Streaks

**User Story:** As a User, I want to track my habits and visualize my streaks, so that I stay motivated and consistent.

#### Acceptance Criteria

1. THE Tracker_Engine SHALL calculate a Streak as the number of consecutive scheduled days on which the User completed a Habit Entry.
2. WHEN a User has not submitted a completed Habit Entry for a Habit Tracker by 23:59 in the User's local time on a scheduled day, THE Tracker_Engine SHALL mark that day as missed and reset the Streak for that Habit to zero.
3. WHEN a User completes a Habit Entry and the Tracker_Engine confirms the previous Streak was reset due to a missed day, THE Tracker_Engine SHALL start a new Streak beginning from the current completion date.
4. THE App SHALL display the current Streak and the longest historical Streak for each Habit Tracker on the Dashboard.
5. WHEN a User's Streak for a Habit reaches a milestone of 7, 30, 66, or 100 consecutive days, THE Notification_Service SHALL send the User a congratulatory notification within 5 minutes of the milestone being reached.
6. WHERE a User has enabled the grace period option for a Habit Tracker and the User has not already used one missed day within the rolling 7-day window starting from the first day of the current Streak, THE Tracker_Engine SHALL allow one missed day without resetting the Streak, taking precedence over the reset rule in criterion 2.

---

### Requirement 5: Goal Setting and Progress Tracking

**User Story:** As a User, I want to set Goals linked to my Trackers, so that I have clear targets to work toward.

#### Acceptance Criteria

1. WHEN a User creates a Goal, THE Goal_Engine SHALL require a target value, a goal direction (ascending or descending), a linked Tracker, and a deadline date.
2. WHEN a User creates a Goal with a deadline date in the past, THE Goal_Engine SHALL return a validation error requiring a future date.
3. WHILE a Goal is active and WHEN a new Entry is submitted for the linked Tracker, THE Goal_Engine SHALL update the User's progress percentage for that Goal, calculated as (sum of Entry values / target value) × 100 for ascending Goals, capped at 100%.
4. WHEN a User's progress percentage reaches 100% for a Goal before or on the deadline, THE Goal_Engine SHALL mark the Goal as completed.
5. WHEN a Goal is marked as completed, THE Notification_Service SHALL notify the User within 5 minutes.
6. WHEN a Goal's deadline passes with progress below 100%, THE Goal_Engine SHALL mark the Goal as expired and display the final progress percentage.
7. THE App SHALL display active, completed, and expired Goals in separate sections of the Goal view.
8. THE Goal_Engine SHALL allow a User to edit the target value or deadline of an active Goal at any time, and SHALL immediately recalculate the progress percentage based on the updated target value.
9. FOR descending Goals, THE Goal_Engine SHALL calculate progress percentage as (1 − (current Entry value / target value)) × 100, capped at 100%, where a lower Entry value indicates greater progress.

---

### Requirement 6: Dashboard and Visualization

**User Story:** As a User, I want a clear Dashboard that shows my progress at a glance, so that I can quickly assess how I am doing across all life dimensions.

#### Acceptance Criteria

1. WHEN a User successfully logs in, THE App SHALL display the Dashboard as the default view within 2 seconds.
2. THE Dashboard SHALL show each active Tracker's name, current Streak (for Habit Trackers), most recent Entry value, and progress percentage toward the linked Goal (if any).
3. THE App SHALL provide a chart view for each Tracker showing Entry values over a selectable time range of 7 days, 30 days, 90 days, or 12 months.
4. WHEN a User selects a time range for a chart, THE App SHALL render the updated chart within 1 second.
5. THE App SHALL support at least the following chart types: line chart for numeric Trackers and bar chart for boolean (habit completion) Trackers.
6. THE Dashboard SHALL display a visually distinct indicator (such as a badge or highlighted border) on each Tracker card that has a pending Entry for the current day.
7. WHEN a User has no Trackers configured and has not previously dismissed the onboarding prompt, THE App SHALL display an onboarding prompt with a clearly labelled call-to-action button that navigates the User to the Tracker creation flow.
8. WHEN a User views a chart for a Tracker with no Entries in the selected time range, THE App SHALL display an empty-state message indicating no data is available for that period.

---

### Requirement 7: Mood and Well-being Tracking

**User Story:** As a User, I want to log my daily mood and energy level, so that I can identify patterns in my emotional well-being over time.

#### Acceptance Criteria

1. THE App SHALL provide a built-in Mood Tracker pre-configured with a 1–10 integer numeric scale.
2. THE App SHALL provide a built-in Energy Tracker pre-configured with a 1–10 integer numeric scale.
3. WHEN a User submits a Mood or Energy Entry with a non-integer value or a value outside the range of 1 to 10 inclusive, THE Tracker_Engine SHALL reject the submission and return a validation error specifying the accepted range.
4. WHEN a User views the Dashboard, THE App SHALL display a weekly mood trend chart showing the average Mood Entry value per day for the past 7 days, using zero or a visual placeholder for days with no Entry.
5. WHEN a User logs a Mood Entry with a value of 3 or below, THE App SHALL display both a supportive message of no more than 50 words and a clearly labelled link to well-being resources together in the same UI element.
6. WHEN a User views the Dashboard, THE App SHALL display a weekly energy trend chart showing the average Energy Entry value per day for the past 7 days, using zero or a visual placeholder for days with no Entry.

---

### Requirement 8: Reminders and Notifications

**User Story:** As a User, I want to receive timely Reminders for my Trackers, so that I maintain consistency without having to remember everything manually.

#### Acceptance Criteria

1. THE Notification_Service SHALL allow a User to configure one or more Reminders per Tracker, each with a specific time of day and one or more days of the week.
2. WHEN a scheduled Reminder time is reached, THE Notification_Service SHALL deliver a push notification to all devices where the User has an active authenticated session within 60 seconds.
3. WHEN the User has already submitted an Entry for a Tracker on the current day before a scheduled Reminder fires for that Tracker, THE Notification_Service SHALL suppress the Reminder for that Tracker on that day, regardless of device online state.
4. THE Notification_Service SHALL allow a User to enable or disable Reminders globally or per Tracker without deleting the Reminder configuration.
5. IF the device is offline when a Reminder is due, THEN THE Notification_Service SHALL deliver the Reminder within 60 seconds of the device reconnecting, provided the Entry suppression check in criterion 3 does not apply at the time of delivery.

---

### Requirement 9: Insights and Trend Analysis

**User Story:** As a User, I want to receive automated Insights about my data, so that I can understand patterns and make informed improvements.

#### Acceptance Criteria

1. WHEN a Tracker has at least 14 days of Entries, THE Insight_Engine SHALL generate at least one Insight summarizing the trend as improving (positive regression slope), stable (slope within ±0.05 units per day), or declining (negative slope below −0.05 units per day) for that Tracker.
2. WHEN a new Entry is submitted for a Tracker, THE Insight_Engine SHALL recalculate Insights for that Tracker within 24 hours of the Entry being saved.
3. THE App SHALL display Insights in a dedicated Insights section, ordered by most recently generated.
4. WHEN the Insight_Engine computes a Pearson correlation coefficient of 0.5 or above between two numeric Trackers that share at least 30 Entry days, THE Insight_Engine SHALL surface a correlation Insight identifying the two Trackers to the User.
5. THE Insight_Engine SHALL calculate trend direction using a linear regression over the most recent 14 Entries for a given Tracker.
6. WHEN a Tracker has fewer than 14 days of Entries, THE App SHALL not display a trend Insight for that Tracker and SHALL display a message indicating that more data is needed.

---

### Requirement 10: Data Export

**User Story:** As a User, I want to export my tracking data, so that I can use it in other tools or keep a personal backup.

#### Acceptance Criteria

1. WHEN a User requests an export, THE Export_Service SHALL allow the User to select all Entries for a specific Tracker or for all Trackers and SHALL generate the export in CSV format.
2. WHEN a User requests an export, THE Export_Service SHALL allow the User to filter the export by specifying a start date and an end date in ISO 8601 format (YYYY-MM-DD).
3. WHEN a User requests an export of up to 10,000 Entries, THE Export_Service SHALL generate and make the file available for download within 10 seconds.
4. WHEN a User requests an export of more than 10,000 Entries, THE Export_Service SHALL notify the User that processing may take longer and SHALL deliver the file within 60 seconds.
5. THE Export_Service SHALL include the following columns in each CSV export: Tracker name, Entry date (ISO 8601), Entry value, Entry note, and Category.
6. THE Export_Service SHALL allow a User to export data as a JSON file in addition to CSV, using the same filtering options.
7. FOR ALL valid Entries where each Entry has a non-null Tracker name, Entry date, and Entry value, exported to JSON and then re-imported into the App, THE Tracker_Engine SHALL reconstruct an Entry set where each re-imported Entry's Tracker name, Entry date, Entry value, Entry note, and Category exactly match the original exported values (round-trip property).
8. WHEN the export filter criteria match no Entries, THE Export_Service SHALL generate an empty file with only the header row (for CSV) or an empty array (for JSON) and inform the User that no data matched the filter.
9. WHEN an export operation fails, THE Export_Service SHALL return an error message describing the failure and SHALL not deliver a partial or corrupted file.

---

### Requirement 11: Onboarding and User Experience

**User Story:** As a new User, I want a guided onboarding experience, so that I can set up my first Trackers quickly and start benefiting from the app immediately.

#### Acceptance Criteria

1. WHEN a User logs in for the first time, THE App SHALL present an onboarding flow of no more than 5 steps before navigating the User to the Dashboard.
2. THE App SHALL offer a selection of at least 5 pre-built Tracker templates (e.g., Sleep, Water Intake, Exercise, Mood, Reading) during onboarding.
3. WHEN a User selects a pre-built template during onboarding, THE Tracker_Engine SHALL create the Tracker with default configuration values within 1 second, and THE App SHALL immediately present an editable form pre-populated with those default values.
4. WHEN a User completes the final step of the onboarding flow, THE App SHALL navigate the User directly to the Dashboard.
5. THE App SHALL allow a User to skip the onboarding flow at any step and navigate directly to the Dashboard without completing the remaining steps.
6. THE App SHALL allow a User to re-run the onboarding flow from the settings menu at any time; WHEN a User re-runs the onboarding flow and selects a template for a Tracker that already exists, THE Tracker_Engine SHALL create a new Tracker with the template defaults rather than modifying the existing one.
7. THE App SHALL allow a User to select multiple pre-built templates in a single onboarding session, limited to the remaining capacity under the 50 active Tracker limit.
