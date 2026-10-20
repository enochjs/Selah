import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { PageQuery } from "../common/pagination.dto";

export class ReviewQuery extends PageQuery {
  @IsOptional() @IsIn(["pending", "approved", "flagged"]) status?: string;
}

export class ReviewDto {
  @IsString() @MaxLength(150) key!: string;
  @IsIn(["pending", "approved", "flagged"]) status!:
    "pending" | "approved" | "flagged";
  @Transform(({ value }: { value: unknown }) => (value === null ? "" : value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note = "";
}
