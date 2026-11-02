import { Module } from "@nestjs/common";
import { HymnsModule } from "../hymns/hymns.module";
import { PlaylistsController } from "./playlists.controller";
import { PublishedPlaylistsController } from "./published-playlists.controller";
import { PlaylistsRepository } from "./playlists.repository";
import { PlaylistsService } from "./playlists.service";

@Module({
  imports: [HymnsModule],
  controllers: [PlaylistsController, PublishedPlaylistsController],
  providers: [PlaylistsRepository, PlaylistsService],
})
export class PlaylistsModule {}
