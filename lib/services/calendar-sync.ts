// Calendar sync now runs against Google Calendar (OAuth, read/write).
// The implementation lives in lib/google/calendar.ts; this module stays as the
// stable entry point that the startup/cron registration imports.
export { syncCalendar } from '@/lib/google/calendar'
