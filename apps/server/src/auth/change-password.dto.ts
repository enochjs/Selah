import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class ChangePasswordDto {
  @IsString() @MaxLength(512) @Matches(/\S/) currentPassword!: string;
  @IsString()
  @MinLength(12)
  @MaxLength(512)
  @Matches(/\S/)
  newPassword!: string;
}
