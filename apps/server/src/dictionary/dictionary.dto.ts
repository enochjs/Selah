import { Transform } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class RevisionDto {
  @IsInt() @Min(0) revision!: number;
}

export class DeleteWordDto extends RevisionDto {
  @IsString() @MaxLength(80) @MinLength(1) word!: string;
}

export class SaveWordDto extends DeleteWordDto {
  @IsString() @MaxLength(1000) @Matches(/\S/) meaning!: string;
  @Transform(({ value }: { value: unknown }) => (value === null ? "" : value))
  @IsOptional()
  @IsString()
  @MaxLength(150)
  phonetic = "";
  @IsString() @MaxLength(60) @Matches(/\S/) type!: string;
}
