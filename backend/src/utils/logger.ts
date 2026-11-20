type LogMeta = Record<string, unknown>;

const REDACTED = "[REDACTED]";
const SENSITIVE_KEYS = [
  "password",
  "passwordhash",
  "password_hash",
  "currentpassword",
  "newpassword",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "groq_api_key",
  "jwt",
  "secret",
  "database_url",
  "csrf",
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, "");
  return SENSITIVE_KEYS.some((sensitive) => normalized.includes(sensitive.replace(/_/g, "")));
}

/** Recursively removes credentials and secrets before anything is logged. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return "[MAX_DEPTH]";
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) return value.map((entry) => redact(entry, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isSensitiveKey(key) ? REDACTED : redact(entry, depth + 1);
    }
    return output;
  }
  return value;
}

function write(level: "info" | "warn" | "error", message: string, meta?: LogMeta) {
  const payload = {
    level,
    time: new Date().toISOString(),
    message,
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, meta?: LogMeta) => write("info", message, meta),
  warn: (message: string, meta?: LogMeta) => write("warn", message, meta),
  error: (message: string, meta?: LogMeta) => write("error", message, meta),
};
