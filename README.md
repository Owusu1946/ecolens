# ecolens

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines Next.js, Hono, ORPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **Next.js** - Full-stack React framework
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Hono** - Lightweight, performant server framework
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **workers** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Clerk
- **Turborepo** - Optimized monorepo build system
- **Biome** - Linting and formatting
- **PWA** - Progressive Web App support

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/server/.env` file with your PostgreSQL connection details.

3. Apply the migrations (PostGIS must be enabled):

```bash
pnpm run db:migrate
```

4. Seed the prototype data (Clerk institutions, demo users and the Western Region dataset):

```bash
pnpm run db:seed          # empty database
pnpm run db:seed --reset  # wipe Ecolens tables and reseed (development only)
```

All seeded data is simulated and labelled as such. Concession and forest-reserve outlines are illustrative, not authoritative.

### Demo accounts (development)

Sign in with the email below; enter the Clerk test code **424242** (no email is sent). Names are fictional.

| Dashboard | Person | Institution | Role | Email |
|---|---|---|---|---|
| Admin | Kofi Asante | Ecolens Platform Team | admin | `ecolens.admin+clerk_test@example.com` |
| Leadership | Abena Owusu | Pilot Steering Group | leadership | `ecolens.leadership+clerk_test@example.com` |
| EPA | Yaw Boateng | EPA Western Region | regulator | `ecolens.epa.regulator+clerk_test@example.com` |
| Analyst | Efua Mensah | EPA Western Region | analyst | `ecolens.epa.analyst+clerk_test@example.com` |
| Field | Kwame Ansah | EPA Western Region | field_officer | `ecolens.epa.field+clerk_test@example.com` |
| EPA | Akosua Darko | EPA Western Region | data_steward | `ecolens.epa.steward+clerk_test@example.com` |
| Minerals Commission | Kojo Appiah | Minerals Commission | regulator | `ecolens.mincom.regulator+clerk_test@example.com` |
| WRC | Esi Quaye | Water Resources Commission | regulator | `ecolens.wrc.regulator+clerk_test@example.com` |
| Responder | Nana Agyeman | Prestea-Huni Valley MA | responder | `ecolens.phvma.responder+clerk_test@example.com` |
| Responder | Adwoa Frimpong | Tarkwa-Nsuaem MA | responder | `ecolens.tnma.responder+clerk_test@example.com` |
| Leadership | Kwesi Arthur | Western Regional Coordinating Council | viewer | `ecolens.wrcc.viewer+clerk_test@example.com` |

## Clerk Authentication Setup

- Follow the guide: [Clerk Quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart)
- Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `apps/web/.env`
- Set `CLERK_SECRET_KEY` in `apps/web/.env` for Clerk server middleware
- Set `CLERK_SECRET_KEY` in `apps/server/.env` for server-side Clerk auth
- Set `CLERK_PUBLISHABLE_KEY` in `apps/server/.env` for server-side Clerk request verification

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@ecolens/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Environment Configuration

Each app owns its environment schema in `.env.schema`. Varlock generates `src/env.ts` during installation; run `pnpm run env:generate` after changing a schema. Commit schemas, and keep secrets in ignored env files or your deployment platform.

Import the generated `ENV` accessor in application code. Shared database and auth packages receive configuration or initialized clients from the application. See [Varlock's monorepo guide](https://varlock.dev/guides/monorepos/).

The server runs on Cloudflare Workers via Wrangler. In local dev, `wrangler dev` loads `apps/server/.env` into the Worker's bindings, which the code reads from `cloudflare:workers`. Binding types live in `apps/server/cloudflare-env.d.ts`.

Bun's automatic env loading is disabled in `bunfig.toml`; the framework integration or server bootstrap loads Varlock. Node deployments must include Varlock and its dependencies alongside the app schema.

Run standalone Node/Bun tools that use Varlock from the owning app directory so they load that app's schema and env files. `env:generate` only generates TypeScript files; it does not initialize environment values in a subsequent command.

## Deployment

### Cloudflare Workers (Wrangler)

- Config: `apps/server/wrangler.jsonc`
- Dev: `pnpm run dev` (no Cloudflare login needed)
- Log in once before deploying: `cd apps/server && pnpm exec wrangler login`
- Set production secrets: `cd apps/server && pnpm exec wrangler secret put DATABASE_URL` (repeat for `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `CORS_ORIGIN`)
- Deploy: `pnpm run deploy`

### Production origins

- Required after the first deploy: set `CORS_ORIGIN` in `apps/server/.env` to the exact deployed web origin, such as `https://app.example.com`, then deploy the server again.

## Git Hooks and Formatting

- Run checks: `pnpm run check`

## Project Structure

```
ecolens/
├── apps/
│   ├── web/         # Frontend application (Next.js)
│   └── server/      # Backend API (Hono, ORPC)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run dev:server`: Start only the server
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run db:push`: Push schema changes to database
- `pnpm run db:generate`: Generate database client/types
- `pnpm run db:migrate`: Run database migrations
- `pnpm run db:seed`: Seed Clerk institutions, demo users and prototype data (`--reset` to reseed)
- `pnpm run db:studio`: Open database studio UI
- `pnpm run check`: Run Biome formatting and linting
- `cd apps/web && pnpm run generate-pwa-assets`: Generate PWA assets