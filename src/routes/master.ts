import { Router } from "express";
import { config } from "../config";
import { saveMasterConfig } from "../configStore";
import { callUnifocus } from "../unifocus/client";

export const masterRouter = Router();

masterRouter.get("/master", async (req, res, next) => {
  try {
    const propertyId =
      (req.query.PropertyId as string | undefined) ??
      (req.query.propertyId as string | undefined) ??
      config.PROPERTY_ID;
    const result = await callUnifocus({
      method: "GET",
      path: "/integrationapi/master/GetAllPropertyMaster",
      query: { PropertyId: propertyId },
      correlationId: res.locals.correlationId,
    });
    if (result.status >= 200 && result.status < 300) {
      await saveMasterConfig(result.data);
    }
    res.status(result.status).json(result.data);
  } catch (err) {
    next(err);
  }
});
