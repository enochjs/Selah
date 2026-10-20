import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { PageQuery } from "../common/pagination.dto";

export class ContentQuery extends PageQuery {
  @IsOptional() @IsString() book?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) chapter?: number;
  @IsOptional() @IsIn(["old", "new"]) testament?: string;
  @IsOptional() @IsIn(["pending", "approved", "flagged"]) status?: string;
  @IsOptional() @IsIn(["en", "zh"]) locale?: string;
  @IsOptional() @IsString() quality?: string;
}
