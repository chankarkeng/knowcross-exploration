import { Router } from "express";
import { callUnifocus } from "../unifocus/client";

export const glitchRouter = Router();

glitchRouter.post("/glitch/search", async (req, res, next) => {
  try {
    const result = await callUnifocus({
      method: "POST",
      path: "/integrationapi/glitch/Glitch_Search",
      body: req.body,
      correlationId: res.locals.correlationId,
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    next(err);
  }
});
