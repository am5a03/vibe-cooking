-- Additive browser access. No recipe or preference data is changed.
CREATE TABLE kitchen_browser_sessions (
  tokenHash TEXT PRIMARY KEY NOT NULL,
  expiresAt INTEGER NOT NULL
);
CREATE INDEX kitchen_browser_sessions_expiry ON kitchen_browser_sessions(expiresAt);
CREATE TABLE kitchen_login_limits (
  key TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL,
  resetsAt INTEGER NOT NULL
);
CREATE INDEX kitchen_login_limits_expiry ON kitchen_login_limits(resetsAt);
