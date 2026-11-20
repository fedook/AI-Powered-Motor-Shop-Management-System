import type { Request, Response } from "express";
import type { z } from "zod";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess } from "../utils/http";
import * as analyticsService from "../services/analytics.service";
import * as baService from "../services/ba.service";
import type {
  productAnalyticsQuerySchema,
  salesAnalyticsQuerySchema,
} from "../validators/sale.validator";
import type {
  analyticsFilterSchema,
  forecastQuerySchema,
  recommendationStatusSchema,
} from "../validators/ba.validator";

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const result = await analyticsService.getDashboard(req.user!.role, req.user!.id);
  sendSuccess(res, result);
});

export const sales = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof salesAnalyticsQuerySchema>;
  const result = await analyticsService.getSalesAnalytics(req.user!.role, query);
  sendSuccess(res, result);
});

export const products = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof productAnalyticsQuerySchema>;
  const result = await analyticsService.getProductAnalytics(req.user!.role, query);
  sendSuccess(res, result);
});

export const datasets = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await baService.getDatasetCounts());
});

export const descriptive = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof analyticsFilterSchema>;
  sendSuccess(res, await baService.getDescriptiveAnalytics(req.user!.role, query));
});

export const predictive = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof forecastQuerySchema>;
  sendSuccess(res, await baService.getPredictiveAnalytics(req.user!.role, query));
});

export const prescriptive = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof forecastQuerySchema>;
  sendSuccess(res, await baService.getPrescriptiveAnalytics(req.user!.role, query));
});

export const workflow = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof forecastQuerySchema>;
  sendSuccess(res, await baService.getBusinessWorkflow(req.user!.role, query));
});

export const recommendationStatus = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof recommendationStatusSchema>;
  const result = await baService.setRecommendationStatus(
    req.user!.role,
    req.params.key as string,
    body.status,
    body.note,
    req.user!.id,
    req,
  );
  sendSuccess(res, result);
});
