import type { Request } from "express";
import { Session } from "../domain/models";

export interface AdminRequest extends Request {
  adminSession: Session;
}
