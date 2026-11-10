import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  ValidateIf,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { PageQuery } from "../common/pagination.dto";
import { Type } from "class-transformer";

export class HymnsQuery extends PageQuery {
  @IsOptional() @IsIn(["enabled", "disabled"]) status?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional()
  @IsIn(["pending", "approved", "rejected"])
  reviewStatus?: string;
}

export class HymnDetailsDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(40000)
  lyrics?: string;
  @IsString() @MaxLength(120) @Matches(/\S/) titleZh!: string;
  @IsString() @MaxLength(120) @Matches(/\S/) titleEn!: string;
  @IsString() @MaxLength(300) @Matches(/\S/) subtitleZh!: string;
  @IsString() @MaxLength(300) @Matches(/\S/) subtitleEn!: string;
  @IsString() @MaxLength(120) @Matches(/\S/) artist!: string;
  @IsString() @MaxLength(60) @Matches(/\S/) category!: string;
  @IsString() @MaxLength(500) @Matches(/\S/) source!: string;
  @IsString() @MaxLength(1000) @Matches(/\S/) license!: string;
}

export class SaveHymnDto extends HymnDetailsDto {
  @IsInt() @Min(0) revision!: number;
  @IsString() @MaxLength(80) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) id!: string;
  @IsBoolean() enabled!: boolean;
}

export class UploadHymnDto extends HymnDetailsDto {
  @Type(() => Number) @IsInt() @Min(0) revision!: number;
}

export class DeleteHymnDto {
  @IsInt() @Min(0) revision!: number;
  @IsString() @MaxLength(80) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) id!: string;
}

export class ReviewHymnDto {
  @IsInt() @Min(0) revision!: number;
  @IsString() @MaxLength(80) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) id!: string;
  @IsIn(["approved", "rejected"]) status!: "approved" | "rejected";
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
