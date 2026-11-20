import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamSchema,
} from "../validators/user.validator";
import * as userController from "../controllers/user.controller";

export const userRouter = Router();

userRouter.use(requireAuth, requirePermission("users:manage"));

userRouter.get("/", validate({ query: listUsersQuerySchema }), userController.list);
userRouter.post("/", validate({ body: createUserSchema }), userController.create);
userRouter.put(
  "/:id",
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  userController.update,
);
userRouter.delete("/:id", validate({ params: userIdParamSchema }), userController.remove);
