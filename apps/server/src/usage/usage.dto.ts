import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { usagePages } from "../domain/usage";

export class UsageEventDto {
  @Matches(/^[a-zA-Z0-9-]{1,80}$/) id!: string;
  @IsInt() @Min(0) at!: number;
  @Matches(/^[a-zA-Z0-9-]{1,80}$/) sessionId!: string;
  @IsIn(["visit", "view", "active", "listen"]) type!:
    "visit" | "view" | "active" | "listen";
  @IsIn(usagePages) page!: string;
  @IsInt() @Min(0) @Max(60) seconds!: number;
  @IsOptional() @IsIn(["hymn", "scripture"]) kind?: "hymn" | "scripture";
  @IsOptional()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9:.-]{0,119}$/)
  contentId?: string;
}
export class UsageBatchDto {
  @IsUUID("4") deviceId!: string;
  @IsIn(["android", "ios", "web"]) platform!: "android" | "ios" | "web";
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-zA-Z0-9.+-]{1,40}$/)
  version!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => UsageEventDto)
  events!: UsageEventDto[];
}
export class UsageQueryDto {
  @Type(() => Number) @IsIn([7, 30, 90]) days: number = 7;
}
