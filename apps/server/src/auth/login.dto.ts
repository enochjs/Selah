import { IsString, Matches, MaxLength } from "class-validator";

export class LoginDto {
  @IsString() @MaxLength(80) @Matches(/\S/) username!: string;
  @IsString() @MaxLength(512) @Matches(/\S/) password!: string;
}
