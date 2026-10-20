import { Global, Module } from "@nestjs/common";
import { ContentRepository } from "./content.repository";
import { CredentialsRepository } from "./credentials.repository";
import { StateRepository } from "./state.repository";
import { SystemRepository } from "./system.repository";

@Global()
@Module({
  providers: [
    ContentRepository,
    StateRepository,
    CredentialsRepository,
    SystemRepository,
  ],
  exports: [
    ContentRepository,
    StateRepository,
    CredentialsRepository,
    SystemRepository,
  ],
})
export class RepositoryModule {}
