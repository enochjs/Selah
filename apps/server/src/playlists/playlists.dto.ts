import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

export class SavePlaylistDto {
  @IsInt() @Min(0) revision!: number;
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  id?: string;
  @IsString() @MaxLength(120) @Matches(/\S/) titleZh!: string;
  @IsString() @MaxLength(120) @Matches(/\S/) titleEn!: string;
  @IsString() @MaxLength(1000) descriptionZh!: string;
  @IsString() @MaxLength(1000) descriptionEn!: string;
  @IsIn(["morning", "mountains", "lake"]) cover!:
    "morning" | "mountains" | "lake";
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { each: true })
  hymnIds!: string[];
  @IsBoolean() enabled!: boolean;
}

export class DeletePlaylistDto {
  @IsInt() @Min(0) revision!: number;
  @IsString() @MaxLength(80) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) id!: string;
}
