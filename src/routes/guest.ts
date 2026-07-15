import { Router } from "express";
import { callUnifocus } from "../unifocus/client";

export const guestRouter = Router();

guestRouter.post("/guest/lookup", async (req, res, next) => {
  try {
    const result = await callUnifocus({
      method: "POST",
      path: "/integrationapi/guest/GuestLookUp",
      body: req.body,
      correlationId: res.locals.correlationId,
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    next(err);
  }
});

guestRouter.post("/guest/baggage-tag", async (req, res, next) => {
  try {
    const result = await callUnifocus({
      method: "POST",
      path: "/integrationapi/guest/UpdateBaggageTag",
      body: req.body,
      correlationId: res.locals.correlationId,
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    next(err);
  }
});
