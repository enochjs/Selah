# Server rules

This workspace is an independently built NestJS TypeScript application. Use `npm --workspace @selah/server run dev`, `build`, `start`, `typecheck`, `lint`, and `test` from the repository root.

## Architecture

- Use a modular monolith organized by feature: `auth`, `content`, `dictionary`, `reviews`, `system`, and `media`. Keep controllers, services, DTOs, and module wiring in their own files. A `*.module.ts` file only composes dependencies.
- Follow `Controller → Service → Repository`. Controllers map validated HTTP input to services and shape HTTP responses. Services own business rules. Put filesystem, subprocess, and stream creation in infrastructure repositories/adapters. Avoid a large route dispatcher or wrapping a legacy handler.
- `domain/` contains plain TypeScript models with no Nest, Express, Expo, React, or filesystem dependencies. `common/` contains shared transport/configuration primitives, not feature business logic.
- Use constructor dependency injection with explicit `@Inject(...)`. Keep TypeScript strict. Do not use `any`, `allowJs`, `@ts-ignore`, or `@ts-nocheck` to bypass typing. Validate DTOs with `class-validator`; reject extra properties globally.
- Do not import Expo, React, `@selah/app`, or files from another application's source. Reuse framework-neutral packages for shared content. ESLint enforces application and I/O boundaries.
- Services accept plain typed inputs and return typed results. Keep Express Request/Response, headers, response streaming, and cleanup in controllers or HTTP helpers. Media services return response plans; controllers execute them. ESLint rejects Express imports in services.
- Keep files readable and format code with Prettier. Avoid compressed declarations and multiple unrelated responsibilities in one file.

## Storage and behavior

- Resolve default paths from this server's physical location, never the process working directory. `createApplication(options)` accepts explicit roots for tests and deployment.
- Canonical content lives in `packages/content/data/`; media in `storage/resources/media/`; credentials/state/backups in `storage/admin/`; audit reports in `storage/resources/audits/`; timing overrides in `storage/resources/timing-overrides/`; legacy alignment in `storage/alignment/`. Static administration assets live in this workspace's `public/` directory.
- Preserve the existing credential and state JSON formats. File state is for one server process: serialize writes, write a private temporary file, and atomically rename it. Preserve dictionary revision conflicts, publication backups, and audit events. Do not deploy multiple processes against the same writable files.
- Keep scrypt password hashes, eight-hour sessions, HttpOnly/SameSite cookies, same-host Origin checks, CSRF checks, request limits, and login throttling. Never print configured passwords. A randomly generated initial password may be shown once at first initialization.
- Preserve public audio HEAD/range/ETag/If-Range behavior and `/api/health`'s `selah-resource` service identifier. Validate media path segments and whitelist public static filenames.
- Run content checks with `execFile` through the system repository, a fixed check script, a timeout, and bounded output; never use a shell.
- Storage environment overrides: `CONTENT_ROOT`, `MEDIA_ROOT`, `ADMIN_STATE_ROOT`, `RESOURCE_AUDIT_ROOT`, `TIMING_ROOT`, and `ALIGNMENT_ROOT`; optional `BIBLE_RESOURCE_ROOT` controls legacy audio. Resolve relative environment paths from the physical repository root. Explicit `createApplication(options)` arguments take precedence. See `.env.example`.
- `main.ts` loads this workspace's `.env` then `.env.local`, with existing process environment taking precedence. Defaults: `127.0.0.1:8890`; use `HOST`/`PORT` or compatibility `ADMIN_HOST`/`ADMIN_PORT` variables.

## Verification

Write behavioral regression tests before changing behavior. Tests use isolated temporary storage and close every Nest application. Before completion run this workspace's typecheck, lint, tests, and build. Also run root content validation when changing publication or content contracts.
