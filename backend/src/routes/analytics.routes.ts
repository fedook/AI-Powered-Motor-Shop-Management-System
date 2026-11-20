import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  productAnalyticsQuerySchema,
  salesAnalyticsQuerySchema,
} from "../validators/sale.validator";
import {
  analyticsFilterSchema,
  forecastQuerySchema,
  recommendationKeyParamSchema,
  recommendationStatusSchema,
} from "../validators/ba.validator";
import * as analyticsController from "../controllers/analytics.controller";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

analyticsRouter.get(
  "/dashboard",
  requirePermission("analytics:dashboard"),
  analyticsController.dashboard,
);
analyticsRouter.get(
  "/sales",
  requirePermission("analytics:sales"),
  validate({ query: salesAnalyticsQuerySchema }),
  analyticsController.sales,
);
analyticsRouter.get(
  "/products",
  requirePermission("analytics:products"),
  validate({ query: productAnalyticsQuerySchema }),
  analyticsController.products,
);

/* ---------------- Business Analytics (descriptive → predictive → prescriptive) ---------------- */
analyticsRouter.get(
  "/datasets",
  requirePermission("analytics:datasets"),
  analyticsController.datasets,
);
analyticsRouter.get(
  "/descriptive",
  requirePermission("analytics:descriptive"),
  validate({ query: analyticsFilterSchema }),
  analyticsController.descriptive,
);
analyticsRouter.get(
  "/predictive",
  requirePermission("analytics:predictive"),
  validate({ query: forecastQuerySchema }),
  analyticsController.predictive,
);
analyticsRouter.get(
  "/prescriptive",
  requirePermission("analytics:prescriptive"),
  validate({ query: forecastQuerySchema }),
  analyticsController.prescriptive,
);
analyticsRouter.get(
  "/workflow",
  requirePermission("analytics:workflow"),
  validate({ query: forecastQuerySchema }),
  analyticsController.workflow,
);
analyticsRouter.patch(
  "/recommendations/:key/status",
  requirePermission("analytics:prescriptive"),
  validate({ params: recommendationKeyParamSchema, body: recommendationStatusSchema }),
  analyticsController.recommendationStatus,
);
