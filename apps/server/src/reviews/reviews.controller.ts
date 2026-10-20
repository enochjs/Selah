import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AdminRequest } from "../auth/admin-request";
import { AdminGuard } from "../auth/admin.guard";
import { ReviewDto, ReviewQuery } from "./review.dto";
import { ReviewsService } from "./reviews.service";

@Controller("api/admin/reviews")
@UseGuards(AdminGuard)
export class ReviewsController {
  constructor(
    @Inject(ReviewsService) private readonly service: ReviewsService,
  ) {}
  @Get() list(@Query() query: ReviewQuery) {
    return this.service.list(query);
  }
  @Put() save(@Body() body: ReviewDto, @Req() request: AdminRequest) {
    return this.service.save(body, request.adminSession.username);
  }
}
