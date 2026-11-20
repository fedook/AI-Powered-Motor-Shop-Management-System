import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { env, isProduction } from "./config/env";
import { API_PREFIX } from "./config/constants";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import {
  requestContext,
  requestLogger,
  requestTimeout,
} from "./middleware/request-context";
import { globalLimiter } from "./middleware/rate-limit";
import { protectStateChangingRequests } from "./middleware/csrf";
import { health } from "./controllers/health.controller";
import { authRouter } from "./routes/auth.routes";
import { productRouter } from "./routes/product.routes";
import { categoryRouter } from "./routes/category.routes";
import { customerRouter } from "./routes/customer.routes";
import { salesRouter } from "./routes/sales.routes";
import { inventoryRouter } from "./routes/inventory.routes";
import { analyticsRouter } from "./routes/analytics.routes";
import { userRouter } from "./routes/user.routes";
import { auditRouter } from "./routes/audit.routes";
import { aiRouter } from "./routes/ai.routes";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY ? 1 : false);

app.use(
  helmet({
    contentSecurityPolicy: false,
    hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
    crossOriginResourcePolicy: { policy: "same-site" },
  }),
);

app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store");
  next();
});

const allowedOrigins = new Set(env.FRONTEND_URL);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS_ORIGIN_DENIED"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "Idempotency-Key",
      "X-Request-Id",
      "Accept",
    ],
    exposedHeaders: ["X-Request-Id", "RateLimit", "RateLimit-Policy", "Retry-After"],
    maxAge: 86_400,
  }),
);

app.use(requestContext);
app.use(requestLogger);
app.use(requestTimeout());
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));
app.use(cookieParser());

app.use(`${API_PREFIX}`, globalLimiter);
app.use(`${API_PREFIX}`, protectStateChangingRequests);

app.get(`${API_PREFIX}/health`, health);
app.get("/health", health);

app.use(`${API_PREFIX}/auth`, authRouter);
app.use(`${API_PREFIX}/products`, productRouter);
app.use(`${API_PREFIX}/categories`, categoryRouter);
app.use(`${API_PREFIX}/customers`, customerRouter);
app.use(`${API_PREFIX}/sales`, salesRouter);
app.use(`${API_PREFIX}/inventory`, inventoryRouter);
app.use(`${API_PREFIX}/analytics`, analyticsRouter);
app.use(`${API_PREFIX}/users`, userRouter);
app.use(`${API_PREFIX}/audit-logs`, auditRouter);
app.use(`${API_PREFIX}/ai`, aiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
