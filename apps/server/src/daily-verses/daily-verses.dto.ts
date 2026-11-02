import { Type } from "class-transformer";
import {
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
export class ReferenceDto {
  @IsString() @MaxLength(40) bookId!: string;
  @IsInt() @Min(1) @Max(150) chapter!: number;
  @IsInt() @Min(1) @Max(176) verse!: number;
  @IsOptional() @IsInt() @Min(1) @Max(176) endVerse?: number;
}
export class SaveDailyVerseDto {
  @IsInt() @Min(0) revision!: number;
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  id!: string;
  @IsString() date!: string;
  @IsDefined()
  @ValidateNested() @Type(() => ReferenceDto) reference!: ReferenceDto;
  @IsString() @Matches(/^[a-f0-9]{64}$/) imageId!: string;
  @IsString() @MaxLength(200) @Matches(/\S/) theme!: string;
}
export class ReviewDailyVerseDto {
  @IsInt() @Min(0) revision!: number;
  @IsString() @MaxLength(100) id!: string;
  @IsIn(["approved", "withdrawn"]) status!: "approved" | "withdrawn";
}
export class UploadDailyImageDto {
  @Type(() => Number) @IsInt() @Min(0) revision!: number;
  @IsString() @MaxLength(200) @Matches(/\S/) author!: string;
  @IsString() @MaxLength(2000) sourceUrl!: string;
  @IsString() @MaxLength(500) @Matches(/\S/) license!: string;
  @IsString() @MaxLength(2000) licenseUrl!: string;
  @IsString() @MaxLength(200) @Matches(/\S/) theme!: string;
}
export class DailyVerseQuery {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}
