# Vibe Cooking

## Tech Stack

### Frontend
- **Framework**: [Next.js 15](https://nextjs.org/) - React framework with App Router and Server Components
- **React**: Version 19.0.0 with experimental React Compiler enabled
- **Language**: [TypeScript 5.7](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS 4.0](https://tailwindcss.com/) - Utility-first CSS framework
- **UI Components**:
  - [Lucide React](https://lucide.dev/) - Icon library
  - [class-variance-authority](https://cva.style/) - Component variant management
  - [tailwind-merge](https://github.com/dcastil/tailwind-merge) - Utility for merging Tailwind classes
- **Forms**:
  - [React Hook Form](https://react-hook-form.com/) - Form state management
  - [Zod](https://zod.dev/) - Schema validation
  - [@hookform/resolvers](https://github.com/react-hook-form/resolvers) - Form validation resolvers

### Backend & Infrastructure
- **Platform**: [Cloudflare Pages](https://pages.cloudflare.com/) - Edge deployment platform
- **Runtime**: Cloudflare Workers (via @cloudflare/next-on-pages)
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) - SQLite database at the edge
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/) - TypeScript ORM with SQLite dialect
- **Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/) - Object storage
- **AI**: [Cloudflare AI](https://developers.cloudflare.com/workers-ai/) - Edge AI inference

### Authentication
- **Auth Provider**: [Better Auth](https://www.better-auth.com/) - Modern authentication library

### Development Tools
- **Linter/Formatter**: [Biome](https://biomejs.dev/) - Fast all-in-one toolchain
- **Package Manager**: npm
- **CLI Tools**:
  - [Wrangler](https://developers.cloudflare.com/workers/wrangler/) - Cloudflare development CLI
  - [Drizzle Kit](https://orm.drizzle.team/kit-docs/overview) - Database migrations toolkit
- **ID Generation**: [@paralleldrive/cuid2](https://github.com/paralleldrive/cuid2) - Collision-resistant IDs

## Project Overview

[To be filled]

## Features

[To be filled]

## Getting Started

[To be filled]

## Architecture

### Overview

Vibe Cooking is built on a modern **edge-first, serverless architecture** powered by Cloudflare's platform. The application leverages Next.js 15 with React Server Components, deployed as static assets on Cloudflare Pages with Workers handling server-side logic at the edge.

### Core Architectural Principles

1. **Edge-First Computing**: All compute happens on Cloudflare's global edge network for minimal latency
2. **Type Safety Throughout**: End-to-end type safety with TypeScript, Drizzle ORM, and Zod validation
3. **Server-First React**: React Server Components by default, client components only where needed
4. **Module-Based Organization**: Feature modules with clear separation (actions, components, schemas, models)

### Application Layers

#### Frontend Layer
- **Location**: `/app` directory (Next.js App Router)
- **Components**: React 19 Server Components (default) and Client Components (marked with `"use client"`)
- **Styling**: Tailwind CSS 4 with shadcn/ui components
- **State Management**: React Hook Form + Zod for forms, Better Auth hooks for authentication
- **Routing**: File-based routing via App Router

#### Backend Layer
- **API Routes**: `/app/api` (planned) for REST endpoints
- **Server Actions**: TypeScript functions that run on the server, callable from client components
- **Authentication**: Better Auth server instance configured in `lib/auth.ts`
- **Business Logic**: Organized in feature modules (e.g., `modules/todos/actions`)

#### Database Layer
- **ORM**: Drizzle ORM with SQLite dialect for type-safe queries
- **Schema**: Defined in `db/schema.ts` (single source of truth)
- **Connection**: Cloudflare D1 binding passed to `getDb()` factory function
- **Migrations**: Managed by Drizzle Kit, stored in `drizzle/migrations`
- **Current Tables**: `users`, `sessions`, `accounts`, `verifications`, `todos`

#### Infrastructure Layer
- **Hosting**: Cloudflare Pages (serverless)
- **Runtime**: Cloudflare Workers (via `@cloudflare/next-on-pages`)
- **Database**: Cloudflare D1 (SQLite at the edge)
- **Storage**: Cloudflare R2 (object storage for files/images)
- **AI**: Cloudflare Workers AI (edge inference)

### Directory Structure

```
vibe-cooking/
├── app/                      # Next.js App Router
│   ├── layout.tsx           # Root layout with metadata
│   ├── page.tsx             # Home page
│   └── globals.css          # Global styles & Tailwind
│
├── db/                       # Database layer
│   ├── schema.ts            # Drizzle ORM table definitions
│   └── index.ts             # Database client factory
│
├── lib/                      # Shared utilities & core logic
│   ├── auth.ts              # Better Auth server configuration
│   ├── auth-client.ts       # Better Auth client hooks
│   └── utils.ts             # Utility functions
│
├── drizzle/                  # Database migrations (generated)
├── .github/workflows/        # CI/CD pipelines
├── wrangler.jsonc           # Cloudflare bindings configuration
└── next.config.ts           # Next.js configuration
```

### Cloudflare Integration

All Cloudflare services are configured via bindings in `wrangler.jsonc`:

| Service | Binding | Purpose |
|---------|---------|---------|
| **D1** | `DB` | SQLite database at the edge for persistent data |
| **R2** | `R2` | Object storage for file uploads and static assets |
| **Workers AI** | `AI` | Edge AI inference for ML workloads |

**Integration Pattern**:
```typescript
// Bindings are available in the Cloudflare Workers context
interface CloudflareEnv {
  DB: D1Database;    // Database binding
  R2: R2Bucket;      // Storage binding
  AI: Ai;            // AI binding
}

// Usage in server code
const db = getDb(env.DB);          // Type-safe database client
const file = await env.R2.get(key); // Object storage access
const result = await env.AI.run(model, input); // AI inference
```

### Authentication Flow

**Server-Side** (`lib/auth.ts`):
- Better Auth configured with Drizzle adapter
- Email/password authentication enabled
- Google OAuth 2.0 integration
- Session management via D1 database

**Client-Side** (`lib/auth-client.ts`):
- React hooks: `useSession`, `signIn`, `signOut`, `signUp`
- Automatic session state management
- Type-safe authentication methods

**Database Tables**:
- `users`: User profiles and credentials
- `sessions`: Active user sessions with token management
- `accounts`: OAuth provider accounts (Google, etc.)
- `verifications`: Email verification tokens

### Data Flow

```
User Interaction (Browser)
    ↓
React Client Component (app/page.tsx)
    ↓
useSession Hook (lib/auth-client.ts)
    ↓
API Route or Server Action (app/api/* or modules/*/actions/)
    ↓
Better Auth Instance (lib/auth.ts)
    ↓
Drizzle ORM Query (db/schema.ts)
    ↓
Cloudflare D1 Database (edge)
```

### Development vs Production

#### Development Environment
- **Frontend**: `npm run dev` - Next.js dev server (http://localhost:3000)
- **Backend**: `npm run wrangler:dev` - Cloudflare Workers with D1/R2/AI bindings
- **Database**: Local SQLite file in `.wrangler/state/`
- **Environment**: Variables from `.env` and `.dev.vars`

#### Production Environment
- **Build**: `next build` → `.vercel/output/static` (Cloudflare Pages compatible)
- **Deploy**: GitHub Actions → Cloudflare Pages
- **Runtime**: Cloudflare Workers (global edge network)
- **Database**: Remote Cloudflare D1 database
- **Secrets**: Configured via Cloudflare dashboard

### Build & Deploy Pipeline

```
GitHub Push
    ↓
GitHub Actions (.github/workflows/ci.yml)
    ↓
Lint (Biome) + Type Check (TypeScript)
    ↓
Build (next build)
    ↓
Deploy (cloudflare/pages-action)
    ↓
Cloudflare Pages (Serverless)
    ↓
Connected to D1 + R2 + AI bindings
```

### Key Design Patterns

1. **Factory Pattern**: Database client factory (`getDb()`) accepts D1 binding
2. **Server Components**: Default rendering strategy, minimal client-side JS
3. **Dependency Injection**: Cloudflare bindings passed to functions, not global
4. **Type-Safe Validation**: Zod schemas for runtime validation, TypeScript for compile-time
5. **Separation of Concerns**: Clear boundaries between UI, logic, and data layers

## Database Schema

[To be filled]

## Deployment

[To be filled]
