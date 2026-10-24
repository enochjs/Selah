import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";
import { PageQuery } from "../common/pagination.dto";

export class HymnsQuery extends PageQuery {
  @IsOptional() @IsIn(["enabled", "disabled"]) status?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
}

export class SaveHymnDto {
  @IsInt() @Min(0) revision!: number;
  @IsString() @MaxLength(80) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) id!: string;
  @IsString() @MaxLength(120) @Matches(/\S/) titleZh!: string;
  @IsString() @MaxLength(120) @Matches(/\S/) titleEn!: string;
  @IsString() @MaxLength(300) @Matches(/\S/) subtitleZh!: string;
  @IsString() @MaxLength(300) @Matches(/\S/) subtitleEn!: string;
  @IsString() @MaxLength(120) @Matches(/\S/) artist!: string;
  @IsString() @MaxLength(60) @Matches(/\S/) category!: string;
  @IsString() @MaxLength(500) @Matches(/\S/) source!: string;
  @IsString() @MaxLength(1000) @Matches(/\S/) license!: string;
  @IsBoolean() enabled!: boolean;
}
