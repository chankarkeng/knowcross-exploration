import { Router } from "express";
import { callUnifocus } from "../unifocus/client";

export const complainRouter = Router();

complainRouter.post("/complain/register", async (req, res, next) => {
  try {
    const result = await callUnifocus({
      method: "POST",
      path: "/integrationapi/complain/RegisterCall",
      body: req.body,
      correlationId: res.locals.correlationId,
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    next(err);
  }
});

complainRouter.post("/complain/search", async (req, res, next) => {
  try {
    const result = await callUnifocus({
      method: "POST",
      path: "/integrationapi/complain/SearchComplain",
      body: req.body,
      correlationId: res.locals.correlationId,
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    next(err);
  }
});

complainRouter.post("/complain/update", async (req, res, next) => {
  try {
    const result = await callUnifocus({
      method: "POST",
      path: "/integrationapi/complain/UpdateComplain",
      body: req.body,
      correlationId: res.locals.correlationId,
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    next(err);
  }
});

complainRouter.get("/complain/attachment", async (req, res, next) => {
  try {
    const result = await callUnifocus({
      method: "GET",
      path: "/integrationapi/complain/GetAttachmentComplain",
      query: { CallRegAttachmentId: req.query.CallRegAttachmentId as string },
      correlationId: res.locals.correlationId,
    });
    res.status(result.status).json(result.data);
  } catch (err) {
    next(err);
  }
});

complainRouter.get("/complain/attachment/stream", async (req, res, next) => {
  try {
    const result = await callUnifocus({
      method: "GET",
      path: "/integrationapi/complain/GetComplainAttachmentStream",
      query: { CallRegAttachmentId: req.query.CallRegAttachmentId as string },
      responseType: "arraybuffer",
      correlationId: res.locals.correlationId,
    });
    res.status(result.status);
    const contentType = result.headers["content-type"];
    if (contentType) res.type(contentType);
    res.send(result.data);
  } catch (err) {
    next(err);
  }
});
