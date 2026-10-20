import { DynamicModule, Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { json } from "express";
import "reflect-metadata";
import { AuthModule } from "./auth/auth.module";
import { HttpErrorFilter } from "./common/http-error.filter";
import {
  resolveOptions,
  SERVER_OPTIONS,
  ServerOptions,
} from "./common/options";
import { ContentModule } from "./content/content.module";
import { DictionaryModule } from "./dictionary/dictionary.module";
import { RepositoryModule } from "./infrastructure/repository.module";
import { MediaModule } from "./media/media.module";
import { ReviewsModule } from "./reviews/reviews.module";
import { SystemModule } from "./system/system.module";

export type { ServerOptions } from "./common/options";

@Module({})
class ConfigurationModule {
  static forRoot(options: ServerOptions): DynamicModule {
    return {
      module: ConfigurationModule,
      global: true,
      providers: [{ provide: SERVER_OPTIONS, useValue: options }],
      exports: [SERVER_OPTIONS],
    };
  }
}

@Module({})
class ApplicationModule {}

export async function createApplication(
  options: Partial<ServerOptions> = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    {
      module: ApplicationModule,
      imports: [
        ConfigurationModule.forRoot(resolveOptions(options)),
        RepositoryModule,
        AuthModule,
        ContentModule,
        DictionaryModule,
        ReviewsModule,
        SystemModule,
        MediaModule,
      ],
    },
    { logger: false, bodyParser: false, abortOnError: false },
  );
  app.disable("x-powered-by");
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (
      request.path.startsWith("/admin") ||
      request.path.startsWith("/api/admin")
    ) {
      response.set({
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "same-origin",
        "X-Frame-Options": "DENY",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      });
      if (
        !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
        !request.is("application/json")
      ) {
        response.status(415).json({ error: "请使用 JSON 请求" });
        return;
      }
    } else {
      response.set({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Range, If-Range, If-None-Match",
        "Access-Control-Expose-Headers":
          "Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified",
      });
      if (request.method === "OPTIONS") {
        response.status(204).end();
        return;
      }
    }
    next();
  });
  app.use(json({ limit: 32768, strict: true }));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpErrorFilter());
  await app.init();
  app.getHttpServer().requestTimeout = 30000;
  return app;
}
