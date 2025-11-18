# Vibe Cooking - Full-Stack Next.js + Cloudflare

A modern full-stack web application template built with Next.js 15, React 19, and Cloudflare's edge platform.

## Tech Stack

### Frontend
- **Next.js 15** - App Router with React Server Components
- **React 19** - Latest React with TypeScript
- **TailwindCSS 4** - Utility-first CSS framework
- **shadcn/ui** - Beautiful, accessible component library
- **React Hook Form + Zod** - Type-safe form validation

### Backend & Infrastructure
- **Cloudflare Workers** - Serverless edge compute
- **Cloudflare D1** - Distributed SQLite database
- **Cloudflare R2** - Object storage
- **Cloudflare Workers AI** - Edge AI inference
- **Drizzle ORM** - Type-safe database queries
- **Better Auth** - Modern authentication with Google OAuth

### Developer Experience
- **TypeScript** - Full type safety
- **Biome** - Fast linting and formatting
- **pnpm** - Efficient package management
- **GitHub Actions** - Automated CI/CD

## Project Structure

```
vibe-cooking/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles
├── components/            # Shared React components
│   └── ui/               # shadcn/ui components
├── db/                   # Database configuration
│   ├── schema.ts         # Drizzle schema definitions
│   └── index.ts          # Database client
├── lib/                  # Utility libraries
│   ├── auth.ts          # Better Auth server config
│   ├── auth-client.ts   # Better Auth client
│   └── utils.ts         # Shared utilities
├── modules/              # Feature modules
│   ├── auth/            # Authentication module
│   ├── dashboard/       # Dashboard module
│   └── todos/           # Todos module
├── drizzle/             # Database migrations
│   └── migrations/      # SQL migration files
└── .github/             # GitHub Actions workflows
    └── workflows/
```

## Prerequisites

- **Node.js** 20 or higher
- **pnpm** (install with `npm install -g pnpm`)
- **Cloudflare Account** (free tier available)
- **Google OAuth Credentials** (optional, for authentication)

## Getting Started

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd vibe-cooking
pnpm install
```

### 2. Environment Setup

Copy the environment variable templates:

```bash
cp .env.example .env
cp .dev.vars.example .dev.vars
```

Update the following variables in both files:

**Cloudflare Configuration:**
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
- `CLOUDFLARE_D1_DATABASE_ID` - D1 database ID (create one first)
- `CLOUDFLARE_D1_TOKEN` - API token with D1 permissions
- `CLOUDFLARE_R2_URL` - R2 bucket public URL

**Authentication:**
- `BETTER_AUTH_SECRET` - Random secret key (generate with `openssl rand -base64 32`)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

### 3. Cloudflare Setup

#### Create D1 Database

```bash
wrangler d1 create vibe-cooking-db
```

Copy the database ID to your environment files.

#### Create R2 Bucket

```bash
wrangler r2 bucket create vibe-cooking-storage
```

Get the public URL from the Cloudflare dashboard under R2 → your bucket → Settings.

#### Run Database Migrations

```bash
# Generate migration files
pnpm run db:generate

# Apply migrations locally
pnpm run db:migrate:local

# Apply migrations to production
pnpm run db:migrate:remote
```

### 4. Google OAuth Setup (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" → "Credentials"
4. Create OAuth 2.0 Client ID
5. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (local)
   - `https://your-domain.com/api/auth/callback/google` (production)
6. Copy the Client ID and Secret to your `.env` files

### 5. Development

The project uses a dual-server setup for optimal development:

**Terminal 1 - Wrangler Dev Server:**
```bash
pnpm run wrangler:dev
```
This provides access to D1, R2, and other Cloudflare services.

**Terminal 2 - Next.js Dev Server:**
```bash
pnpm run dev
```
This runs Next.js with hot module reloading on http://localhost:3000

### 6. Database Management

```bash
# Generate new migrations after schema changes
pnpm run db:generate

# Apply migrations locally
pnpm run db:migrate:local

# Apply migrations to production
pnpm run db:migrate:remote

# Open Drizzle Studio (database GUI)
pnpm run db:studio:local
```

## Available Scripts

- `pnpm dev` - Start Next.js development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run Biome linter
- `pnpm format` - Format code with Biome
- `pnpm wrangler:dev` - Start Wrangler dev server
- `pnpm db:generate` - Generate database migrations
- `pnpm db:migrate:local` - Apply migrations locally
- `pnpm db:migrate:remote` - Apply migrations to production
- `pnpm db:studio:local` - Open Drizzle Studio
- `pnpm deploy` - Deploy to Cloudflare Pages

## Deployment

### GitHub Actions (Recommended)

The repository includes automated CI/CD workflows:

1. **CI Workflow** - Runs on all PRs and commits
   - Linting with Biome
   - TypeScript type checking

2. **Deploy Workflow** - Deploys to Cloudflare Pages
   - Automatic preview deployments for PRs
   - Production deployment on main branch

**Required GitHub Secrets:**
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `NEXT_PUBLIC_APP_URL`

### Manual Deployment

```bash
# Build and deploy to Cloudflare Pages
pnpm run deploy
```

## Adding shadcn/ui Components

```bash
# Install shadcn CLI globally
pnpm add -g shadcn-ui

# Add components
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add form
```

## Project Architecture

This template uses a **module-sliced architecture** for better organization:

```
modules/
└── feature-name/
    ├── actions/      # Server Actions
    ├── components/   # Feature-specific components
    ├── schemas/      # Zod validation schemas
    └── models/       # TypeScript types
```

### Example Module Structure

```typescript
modules/
└── todos/
    ├── actions/
    │   └── todo-actions.ts       # Server Actions for todos
    ├── components/
    │   ├── todo-list.tsx         # Todo list component
    │   └── todo-item.tsx         # Todo item component
    ├── schemas/
    │   └── todo-schema.ts        # Zod schemas for validation
    └── models/
        └── todo-types.ts         # TypeScript types
```

## Database Schema

The template includes pre-configured tables for Better Auth:

- `user` - User accounts
- `session` - User sessions
- `account` - OAuth provider accounts
- `verification` - Email verification tokens
- `todo` - Example application table

Modify `db/schema.ts` to add your own tables.

## Best Practices

### Type Safety
- Use Drizzle ORM for type-safe database queries
- Define Zod schemas for runtime validation
- Keep TypeScript strict mode enabled

### Authentication
- Use Better Auth for secure authentication
- Implement proper session management
- Add CSRF protection for forms

### Performance
- Leverage React Server Components
- Use edge functions for global performance
- Implement proper caching strategies

### Code Quality
- Format code with Biome before committing
- Write meaningful commit messages
- Keep components small and focused

## Troubleshooting

### Wrangler Issues
```bash
# Clear Wrangler cache
rm -rf .wrangler

# Re-authenticate
wrangler login
```

### Database Migration Errors
```bash
# Reset local database
rm -rf .wrangler/state

# Re-run migrations
pnpm run db:migrate:local
```

### Build Errors
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules
pnpm install
```

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Better Auth](https://www.better-auth.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [TailwindCSS](https://tailwindcss.com/)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
