import type { Request, Response } from "express";
import type { MediaRequest, MediaResponsePlan } from "./media.types";

export function mediaRequest(request: Request): MediaRequest {
  return {
    head: request.method === "HEAD",
    range: request.headers.range,
    ifRange:
      typeof request.headers["if-range"] === "string"
        ? request.headers["if-range"]
        : undefined,
    ifNoneMatch:
      typeof request.headers["if-none-match"] === "string"
        ? request.headers["if-none-match"]
        : undefined,
  };
}

export function sendMedia(response: Response, plan: MediaResponsePlan) {
  response.set(plan.headers).status(plan.status);
  if (!plan.stream) {
    response.end();
    return;
  }
  const stream = plan.stream();
  stream.on("error", () => response.destroy());
  response.on("close", () => stream.destroy());
  stream.pipe(response);
}
