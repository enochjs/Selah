import { IsIn, IsOptional } from "class-validator";

export class DownloadManifestQuery {
  @IsOptional()
  @IsIn(["chapter"])
  mode?: "chapter";
}
