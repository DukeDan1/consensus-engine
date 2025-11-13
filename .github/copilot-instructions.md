# GitHub Copilot Instructions for Consensus Engine

## Project Overview

Consensus Engine is a Next.js 15 application built with TypeScript, React 19, and MongoDB. It's a web application for managing discussions, topics, arguments, and consensus-building with authentication and user management features.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Bootstrap 5 (Bootswatch Litera theme), Tailwind CSS 4, Custom CSS
- **Backend**: Next.js API Routes (TypeScript)
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: NextAuth.js v4
- **Email**: Azure Communication Services, Nodemailer
- **AI Integration**: OpenAI API
- **Deployment**: Google Cloud Run (Docker containers)
- **Testing**: Jest with React Testing Library
- **Linting**: ESLint with Next.js config

## Development Setup

### Prerequisites
- Node.js 22.x
- npm (comes with Node.js)
- MongoDB connection (local or remote)

### Installation
```bash
npm ci  # Use ci for reproducible builds
```

### Running the Application
```bash
npm run dev       # Start development server with Turbopack
npm run build     # Build for production
npm run start     # Start production server
npm run lint      # Run ESLint
npm run test      # Run Jest tests
npm run populate  # Populate database with sample data
```

### Environment Variables
Required environment variables (see deployment configs):
- `MONGODB_URI` - MongoDB connection string
- `NEXTAUTH_SECRET` - NextAuth secret key
- `NEXTAUTH_URL` - Application URL
- `OPENAI_API_KEY` - OpenAI API key
- `AZURE_COMMUNICATION_SERVICE_CONNECTION_STRING` - Azure email service
- `NODE_ENV` - Environment (development/production)

## Code Style and Conventions

### TypeScript
- **Strict mode enabled**: All TypeScript strict checks are enforced
- **Interface naming**: Use `I` prefix for interfaces extending Document (e.g., `IUser`)
- **Type imports**: Use `import type` for type-only imports
- **Path aliases**: Use `@/` for imports from `src/` directory

### File Organization
- **API Routes**: Place in `src/app/api/` following Next.js 15 App Router conventions
  - Use `route.ts` files for API endpoints
  - Export named functions: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`
- **Models**: Place Mongoose models in `src/app/models/`
- **Components**: Place in `src/app/components/` with logical subdirectories
- **Services**: Business logic in `src/app/services/`
- **Utilities**: Helper functions in `src/app/lib/`

### React Components
- **Use Server Components by default**: Only add `"use client"` directive when necessary (for hooks, event handlers, browser APIs)
- **Async Server Components**: Prefer `async` server components for data fetching
- **Component naming**: PascalCase for component files and functions
- **Props**: Define TypeScript interfaces for component props

### API Routes Pattern
```typescript
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Validate input
    if (!body.field) {
      return NextResponse.json(
        { success: false, message: "Field is required" },
        { status: 400 }
      );
    }
    
    // Process request
    // ...
    
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error("Error:", err);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### Mongoose Models Pattern
- Extend `Document` interface for model types
- Use `Schema.Types` for special types
- Include timestamps: `{ timestamps: true, strict: true }`
- Export with model caching: `mongoose.models.ModelName || mongoose.model(...)`
- Use sparse indexes for optional unique fields

### Error Handling
- Always use try-catch blocks in API routes
- Log errors with `console.error()`
- Return proper HTTP status codes (400 for client errors, 500 for server errors)
- Include descriptive error messages in response

### Authentication
- Use NextAuth.js for authentication
- Check authentication status in server components using `getServerSession()`
- Protect API routes by validating session
- Store user sessions and track login history with IP addresses

## Testing Guidelines

- Place test files next to the code they test or in `__tests__` directories
- Use descriptive test names: `it("should do something when condition")`
- Mock external dependencies (database, APIs)
- Test both success and error cases

## Build and Deployment

### CI/CD Pipeline
- **Linting**: Runs on all branches via GitHub Actions
- **Building**: Runs after linting passes
- **Deployment**: Automatic deployment to Google Cloud Run on `main` branch

### Docker
- Application is containerized using the provided `Dockerfile`
- Production build uses Node.js 22
- Deployed to Google Cloud Run in `europe-west1` region

### Build Requirements
- Must provide dummy values for `MONGODB_URI` and `OPENAI_API_KEY` during build (real values injected at runtime)
- Build command: `npm run build`
- ESLint must pass with zero warnings

## Common Patterns

### Data Fetching in Server Components
```typescript
export default async function Page() {
  await connectDB();
  const data = await Model.find({}).lean();
  return <div>{/* render data */}</div>;
}
```

### Client Components with State
```typescript
"use client";
import { useState } from "react";

export default function ClientComponent() {
  const [state, setState] = useState(initial);
  // Component logic
}
```

### Database Connection
- Import and call connection utility before database operations
- Use `.lean()` for read-only queries to improve performance
- Handle connection errors gracefully

## Best Practices

1. **Minimal Changes**: Make the smallest possible changes to achieve the goal
2. **Type Safety**: Leverage TypeScript for type safety, avoid `any` types
3. **Server-First**: Prefer server components and server-side data fetching
4. **Performance**: Use Next.js built-in optimizations (Image, Font, etc.)
5. **Security**: Never commit secrets, use environment variables
6. **Validation**: Always validate user input in API routes
7. **Error Handling**: Comprehensive error handling with proper logging
8. **Code Reuse**: Extract common logic into utility functions
9. **Accessibility**: Use semantic HTML and ARIA attributes where needed
10. **Responsive Design**: Ensure UI works on mobile and desktop (Bootstrap grid system)

## Dependencies Management

- Use `npm ci` for reproducible builds (not `npm install`)
- Keep dependencies up to date but test thoroughly
- Check for vulnerabilities with `npm audit`
- Pin major versions in package.json

## Project-Specific Notes

- Uses Bootstrap's Litera theme from Bootswatch
- Font Awesome icons are available globally
- Roboto Flex is the primary font
- Toast notifications via react-toastify
- Error boundaries are in place for error handling
- Suspense boundaries for loading states
- Progressive profile completion with onboarding steps
- GDPR consent tracking for users

## Common Commands

```bash
# Development
npm run dev

# Linting (must pass before commit)
npm run lint

# Building (must succeed before deployment)
npm run build

# Testing
npm run test

# Database population
npm run populate
```

## Getting Help

- Review existing code patterns before implementing new features
- Check Next.js 15 documentation for App Router conventions
- Refer to Mongoose documentation for schema definitions
- Follow TypeScript best practices for type definitions
