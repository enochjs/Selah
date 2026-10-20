import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(2000) q = "";
}

export function pageOf<T>(items: T[], query: PageQuery) {
  return {
    items: items.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    ),
    total: items.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}
