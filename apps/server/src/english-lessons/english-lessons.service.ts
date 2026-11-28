import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { immutableMedia, mediaResponse } from "../media/media-response";
import type { MediaRequest } from "../media/media.types";
import { EnglishLessonsRepository } from "./english-lessons.repository";

@Injectable()
export class EnglishLessonsService {
  constructor(
    @Inject(EnglishLessonsRepository)
    private readonly repository: EnglishLessonsRepository,
  ) {}

  async catalog() {
    const lessons = await this.repository.catalog();
    const available = await Promise.all(
      lessons.map((lesson) => this.repository.video(lesson.sha256)),
    );
    return {
      version: 1,
      lessons: lessons.filter((_, index) => available[index]),
    };
  }

  async video(name: string, request: MediaRequest) {
    const sha256 = /^([a-f0-9]{64})\.mp4$/.exec(name)?.[1];
    if (!sha256) throw new NotFoundException("课程视频不存在");
    const lessons = await this.repository.catalog();
    const file = lessons.some((lesson) => lesson.sha256 === sha256)
      ? await this.repository.video(sha256)
      : null;
    if (!file) throw new NotFoundException("课程视频不存在");
    return mediaResponse(file, request, "video/mp4", immutableMedia);
  }
}
