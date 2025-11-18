# Project Context

## Purpose

**Vibe Cooking** is an AI-powered recipe inspiration platform designed to help home cooks discover what to prepare based on their available resources and dietary preferences.

The application addresses two common challenges that home cooks face:

1. **Ingredient-Based Recipe Discovery**: Home cooks often have ingredients in their refrigerators but lack inspiration for what to cook. Vibe Cooking allows users to input the ingredients they have on hand, and the application generates personalized recipe suggestions that make the best use of those ingredients.

2. **Diet-Conscious Meal Planning**: Users can set their dietary habits and restrictions (such as calorie requirements, nutritional goals, allergen avoidances, or specific diet types like vegetarian, keto, etc.), and the application will generate recipe ideas that align with their health and lifestyle goals.

By leveraging AI at the edge (Cloudflare AI), Vibe Cooking provides fast, personalized recipe recommendations that help reduce food waste and support healthier eating habits.

## Features

### Core Features
- **Ingredient-to-Recipe Generator**: Input available ingredients and receive AI-generated recipe suggestions
- **Diet-Based Recipe Planner**: Set dietary preferences and restrictions to get personalized meal ideas
- **Smart Recipe Matching**: AI-powered algorithms to match ingredients and dietary requirements with suitable recipes

### Planned Features
- User authentication and profile management
- Save favorite recipes and meal plans
- Shopping list generation based on recipe selections
- Nutritional information display for generated recipes
- Recipe history and personalization based on user preferences
- Image storage for recipe photos (via Cloudflare R2)
- Multi-language support

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

## Getting Started

[To be filled]

## Architecture

[To be filled]

## Database Schema

[To be filled]

## Deployment

[To be filled]
