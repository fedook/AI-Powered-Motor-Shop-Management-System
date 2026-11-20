import { Router } from "express";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { authLimiter } from "../middleware/rate-limit";
import { validate } from "../middleware/validate";
import {
  loginSchema,
  passwordChangeSchema,
  profileUpdateSchema,
  registerSchema,
} from "../validators/auth.validator";
import * as authController from "../controllers/auth.controller";

export const authRouter = Router();

authRouter.post("/register", authLimiter, validate({ body: registerSchema }), authController.register);
authRouter.post("/login", authLimiter, validate({ body: loginSchema }), authController.login);
authRouter.post("/logout", optionalAuth, authController.logout);
authRouter.get("/me", requireAuth, authController.me);
authRouter.get("/csrf", requireAuth, authController.csrf);
authRouter.put(
  "/profile",
  requireAuth,
  validate({ body: profileUpdateSchema }),
  authController.updateProfile,
);
authRouter.put(
  "/password",
  requireAuth,
  validate({ body: passwordChangeSchema }),
  authController.changePassword,
);
authRouter.post("/logout-all", requireAuth, authController.logoutAll);
