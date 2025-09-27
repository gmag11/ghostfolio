# Ghostfolio Development Guide for AI Assistants

## Project Architecture

Ghostfolio is a modern wealth management web application built as an **Nx monorepo** with:

- **Backend**: NestJS API (`apps/api`) with PostgreSQL/Prisma and Redis caching
- **Frontend**: Angular SPA (`apps/client`) with Angular Material and multi-language support
- **Shared Libraries**: `libs/common` (shared types/helpers) and `libs/ui` (Angular components)
- **Database**: Prisma ORM with PostgreSQL, schema at `prisma/schema.prisma`

### Key Architectural Patterns

**Dependency Flow**: Client → API → Common (shared interfaces/helpers)

- `libs/common` contains shared TypeScript interfaces, helpers, and constants
- `libs/ui` contains reusable Angular components with Storybook documentation
- API modules follow NestJS patterns with controllers, services, and modules

**Data Flow**: Controllers → Services → Prisma → Database

- Controllers handle HTTP routing and validation (`*.controller.ts`)
- Services contain business logic (`*.service.ts`)
- Prisma models define database schema and provide type-safe DB access

**Queue System**: Bull queues for background processing

- `DATA_GATHERING_QUEUE`: Asset profile and historical market data gathering
- `PORTFOLIO_SNAPSHOT_COMPUTATION_QUEUE`: Portfolio performance calculations

## Development Workflow

### Essential Commands

```bash
# Database setup
npm run database:setup          # Initialize schema + seed data
npm run database:push          # Sync schema without migration
npm run database:gui           # Open Prisma Studio

# Development servers
npm run start:server           # NestJS API (http://localhost:3333)
npm run start:client           # Angular client (https://localhost:4200/en)
npm run start:storybook        # Component library

# Testing & Quality
npm run test:api               # Backend unit tests
npm run test:common            # Shared library tests
npm run lint                   # ESLint across all projects
npm run format                 # Prettier formatting

# Build & Deployment
npm run build:production       # Full production build
npm run analyze:client         # Bundle analysis for client
```

### Nx-Specific Patterns

- Use `nx run <project>:<target>` for running specific project tasks
- Library imports use TypeScript paths: `@ghostfolio/common/helper`, `@ghostfolio/ui/components`
- Project dependencies are enforced by Nx - check `nx.json` for configuration
- Build caching enabled - use `nx reset` to clear cache if needed

## Key Conventions

### API Development

- **Module Structure**: Each feature has `module.ts`, `controller.ts`, `service.ts`
- **Decorators**: Use `@Controller()`, `@Get()`, `@Post()` etc. for routing
- **Validation**: DTOs with `class-validator` decorators for request validation
- **Error Handling**: Use HTTP status codes from `http-status-codes` package
- **Authentication**: JWT-based auth with `@UseGuards(AuthGuard)` for protected routes
- **API Versioning**: URI-based versioning (`/api/v1/`)
- **Global Prefix**: All API routes prefixed with `/api`

### Frontend Development

- **Component Prefix**: All components use `gf-` prefix (configured in `project.json`)
- **Styling**: SCSS with Angular Material + Bootstrap utility classes
- **i18n**: Built-in Angular i18n with `i18n` markers for translatable text
- **State Management**: `@codewithdan/observable-store` for client state
- **Services**: Angular services for HTTP communication with backend
- **Multi-language**: 12 supported languages with dynamic baseHref configuration
- **SSL Development**: Uses `localhost.cert` and `localhost.pem` for HTTPS

### Database Patterns

- **Prisma Models**: Define in `prisma/schema.prisma` with proper relations
- **Migrations**: Use `npm run prisma migrate dev --name <description>` for schema changes
- **Seeding**: Database seeds in `prisma/seed.mts` for development data
- **Asset Classes**: Predefined enums for `AssetClass` and `AssetSubClass`
- **Data Sources**: Multiple data sources (YAHOO, COINGECKO, MANUAL, etc.)

### Queue Processing

- **Data Gathering**: Background jobs for fetching asset profiles and market data
- **Portfolio Snapshots**: Async computation of portfolio performance metrics
- **Job Options**: Configurable retry logic with exponential backoff
- **Priority Levels**: High, medium, and low priority queue processing

## Common Integration Points

### Authentication Flow

1. Frontend login → API `/auth` endpoints
2. JWT token stored in client, sent as Bearer token
3. Protected routes use `@UseGuards(AuthGuard)` decorator
4. Support for Google OAuth and Internet Identity (ICP)

### Data Provider Integration

- External market data from Yahoo Finance, CoinGecko, Alpha Vantage, etc.
- Data fetching handled by dedicated services in `apps/api/services/data-provider/`
- Cached with Redis for performance
- Queue-based processing for large datasets

### Portfolio Calculations

- Performance metrics calculated in `PortfolioService`
- Uses `big.js` for precise decimal arithmetic
- Time-based performance ranges: 1d, wtd, mtd, ytd, 1y, 5y, max
- Snapshot-based computation for historical performance

### Multi-language Support

- 12 supported languages: ca, de, en, es, fr, it, nl, pl, pt, tr, uk, zh
- Dynamic route generation with language-specific baseHref
- Translation files in `apps/client/src/locales/`
- Server-side language detection via Accept-Language header

## Critical Configuration

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`: Redis configuration
- `JWT_SECRET_KEY`: JWT token signing
- `ACCESS_TOKEN_SALT`: Access token encryption
- `API_KEY_COINGECKO_PRO`: CoinGecko Pro API key
- `ENABLE_FEATURE_SUBSCRIPTION`: Enable subscription features

### Key Constants

- `DEFAULT_CURRENCY`: 'USD'
- `PRIMARY_COLOR_HEX`: '#36cfcc' (Ghostfolio brand color)
- `MAX_TOP_HOLDINGS`: 50 (maximum holdings displayed)
- `DEFAULT_PAGE_SIZE`: 50 (pagination default)

## Debugging Tips

### Database Issues

- Check connections with `npm run database:gui`
- Reset database: `npm run database:push` (destructive - only in development)
- View query logs by enabling Prisma debug logging

### Development Server Issues

- API runs on port 3333, client on 4200
- SSL certificates for HTTPS: `apps/client/localhost.cert` and `localhost.pem`
- Use `npm run watch:server` + VS Code debugger for API debugging

### Queue Processing Issues

- Monitor Bull queues via Redis or custom admin interfaces
- Check job status: active, completed, delayed, failed, paused, waiting
- Retry failed jobs automatically with exponential backoff

### Build Issues

- Clean builds: `nx run-many --target=build --all`
- Check Nx cache: `nx reset` to clear build cache
- Bundle analysis: `npm run analyze:client` for client bundle inspection

## Testing Patterns

- **API Tests**: Jest tests alongside source files (`*.spec.ts`)
- **Test Environment**: Uses `.env.example` for test database configuration
- **Mocking**: Mock external services and dependencies in unit tests
- **E2E Tests**: Cypress tests for client and UI libraries

## Security Considerations

- **Helmet**: Security headers with CSP for Stripe integration
- **Validation**: Global validation pipe with whitelisting
- **Rate Limiting**: Request timeout configuration for data providers
- **File Upload**: 10MB limit for CSV/JSON import files

Remember: This is a financial application handling sensitive data - always consider security, precision (use `big.js` for calculations), and proper error handling in your implementations.
