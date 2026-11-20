import type { Request, Response } from "express";
import type { z } from "zod";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess } from "../utils/http";
import * as customerService from "../services/customer.service";
import type {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "../validators/customer.validator";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof listCustomersQuerySchema>;
  const result = await customerService.listCustomers(query);
  sendSuccess(res, result.data, result.meta);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.getCustomer(
    req.params.id!,
    { id: req.user!.id, role: req.user!.role },
    req,
  );
  sendSuccess(res, customer);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as z.infer<typeof createCustomerSchema>;
  const customer = await customerService.createCustomer(input, req.user!.id, req);
  sendSuccess(res, customer, undefined, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as z.infer<typeof updateCustomerSchema>;
  const customer = await customerService.updateCustomer(
    req.params.id!,
    input,
    req.user!.id,
    req,
  );
  sendSuccess(res, customer);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await customerService.deleteCustomer(req.params.id!, req.user!.id, req);
  sendSuccess(res, { message: "Customer deleted." });
});
