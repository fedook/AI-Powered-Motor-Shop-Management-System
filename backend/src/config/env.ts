import "dotenv/config";
import { z } from "zod";

const boolFromEnv = z
  .enum(["0", "1", "true", "false"])
  .default("0")
  .transform((value) => value === "1" || value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(7000),
  FRONTEND_URL: z
    .string()
    .min(1)
    .default("http://localhost:5173")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_DATABASE_URL: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() ? value.trim() : undefined)),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("1d"),
  GROQ_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() ? value.trim() : undefined)),
  GROQ_MODEL: z
    .string()
    .default("openai/gpt-oss-120b")
    .transform((value) => {
      const trimmed = value.trim();
      if (!trimmed) return "openai/gpt-oss-120b";
      // Model availability is validated at runtime against the Groq provider.
      return trimmed;
    }),
  GROQ_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(25000),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  STAFF_EMAIL: z.string().optional(),
  STAFF_PASSWORD: z.string().optional(),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() ? value.trim() : undefined)),
  TRUST_PROXY: boolFromEnv,
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("\n");
  console.error(`\n[config] Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
export const JWT_ISSUER = "motor-shop-api";
export const JWT_AUDIENCE = "motor-shop-web";
export const AUTH_COOKIE = "ms_token";
export const CSRF_COOKIE = "ms_csrf";
export const CSRF_HEADER = "x-csrf-token";

if (env.COOKIE_SAME_SITE === "none" && !isProduction) {
  console.warn(
    "[config] COOKIE_SAME_SITE=none requires HTTPS; browsers may drop the cookie over plain HTTP.",
  );
}
if (isProduction && env.JWT_SECRET.length < 48) {
  console.warn("[config] JWT_SECRET is shorter than 48 characters in production.");
}
