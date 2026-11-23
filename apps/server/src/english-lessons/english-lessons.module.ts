import { Module } from "@nestjs/common";
import { EnglishLessonsController } from "./english-lessons.controller";
import { EnglishLessonsRepository } from "./english-lessons.repository";
import { EnglishLessonsService } from "./english-lessons.service";

@Module({
  controllers: [EnglishLessonsController],
  providers: [EnglishLessonsRepository, EnglishLessonsService],
})
export class EnglishLessonsModule {}
