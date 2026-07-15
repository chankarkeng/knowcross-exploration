import { Router } from "express";
import { callUnifocus } from "../unifocus/client";

export const automationRouter = Router();

automationRouter.post("/automation/event", async (req, res, next) => {
  try {
    const result = await callUnifocus({
      method: "POST",
      path: "/integrationapi/automation/PublishEvent",
      body: req.body,
      correlationId: res.locals.correlationId,
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    next(err);
  }
});
