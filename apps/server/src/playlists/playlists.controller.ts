import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { AdminRequest } from "../auth/admin-request";
import { EmptyDto } from "../common/empty.dto";
import { DeletePlaylistDto, SavePlaylistDto } from "./playlists.dto";
import { PlaylistsService } from "./playlists.service";

@Controller("api/admin/playlists")
@UseGuards(AdminGuard)
export class PlaylistsController {
  constructor(
    @Inject(PlaylistsService) private readonly service: PlaylistsService,
  ) {}
  @Get() list(@Query() _query: EmptyDto) {
    void _query;
    return this.service.list();
  }
  @Put() save(@Body() body: SavePlaylistDto, @Req() request: AdminRequest) {
    return this.service.save(body, request.adminSession.username);
  }
  @Delete() remove(
    @Body() body: DeletePlaylistDto,
    @Req() request: AdminRequest,
  ) {
    return this.service.remove(body, request.adminSession.username);
  }
}
