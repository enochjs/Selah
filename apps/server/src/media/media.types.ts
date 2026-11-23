import type { Readable } from "node:stream";

export interface MediaFile {
  size: number;
  mtime: Date;
  mtimeMs: number;
  stream: (start: number, end: number) => Readable;
}

export interface MediaRequest {
  head: boolean;
  range?: string;
  ifRange?: string;
  ifNoneMatch?: string;
}

export interface MediaResponsePlan {
  status: 200 | 206 | 304 | 416;
  headers: Record<string, string>;
  stream?: () => Readable;
}

export interface MediaAddress {
  kind: string;
  name: string;
  version?: string;
  folder?: string;
}
