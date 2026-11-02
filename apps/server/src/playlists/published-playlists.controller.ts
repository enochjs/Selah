import { Controller, Get, Header, Inject } from "@nestjs/common";
import { PlaylistsService } from "./playlists.service";

@Controller("api/playlists")
export class PublishedPlaylistsController {
  constructor(
    @Inject(PlaylistsService) private readonly service: PlaylistsService,
  ) {}
  @Get()
  @Header("Cache-Control", "no-store")
  list() {
    return this.service.published();
  }
}
