process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/marketfilter_test";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-session-secret-123456";
process.env.APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5173";
process.env.OPENAI_SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || "gpt-4.1-mini";
process.env.SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED || "false";
