import { Type } from "class-transformer";
import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
export class UpdateArtifactDto {
  @Matches(/^\/api\/app-updates\/artifacts\/[a-f0-9]{64}\.apk$/) path!: string;
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) size!: number;
  @Matches(/^[a-f0-9]{64}$/) sha256!: string;
}
export class UpdateQuery {
  @IsIn(["android", "ios"]) platform!: "android" | "ios";
  @IsIn(["direct", "store", "testflight"]) channel!:
    "direct" | "store" | "testflight";
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2100000000)
  buildNumber!: number;
}
export class DeleteUpdateDto {
  @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) revision!: number;
  @IsString() @Matches(/^release-[a-f0-9-]{36}$/) id!: string;
}
export class SaveUpdateDto {
  @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) revision!: number;
  @IsOptional() @Matches(/^release-[a-f0-9-]{36}$/) id?: string;
  @IsIn(["android", "ios"]) platform!: "android" | "ios";
  @IsIn(["direct", "store", "testflight"]) channel!:
    "direct" | "store" | "testflight";
  @Equals("app.selah.bible") appId!: string;
  @IsString()
  @Matches(/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/)
  @MaxLength(40)
  version!: string;
  @IsInt() @Min(1) @Max(2100000000) buildNumber!: number;
  @IsInt() @Min(1) @Max(2100000000) minSupportedBuild!: number;
  @IsIn(["normal", "important"]) importance!: "normal" | "important";
  @IsString() @Matches(/\S/) @MaxLength(6000) notesZh!: string;
  @IsString() @Matches(/\S/) @MaxLength(6000) notesEn!: string;
  @ValidateIf((_object, value: unknown) => value !== null)
  @ValidateNested()
  @Type(() => UpdateArtifactDto)
  artifact!: UpdateArtifactDto | null;
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @MaxLength(2048)
  storeUrl!: string | null;
  @IsBoolean() enabled!: boolean;
}
