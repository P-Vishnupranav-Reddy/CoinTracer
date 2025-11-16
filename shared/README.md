# Shared Utilities

Common utilities and middleware for CoinTracer microservices.

## Features

- **Database**: Standardized PostgreSQL connection pool
- **Authentication**: JWT middleware for protecting routes
- **CORS**: Consistent CORS configuration
- **Error Handling**: Global error handlers and custom error classes
- **Logging**: Structured logging with timestamps and colors
- **Health Checks**: Standardized health check endpoints

## Usage

```javascript
const {
  database,
  authMiddleware,
  corsMiddleware,
  errorHandler,
  notFoundHandler,
  createLogger,
  healthCheck,
} = require('@cointracer/shared');

const logger = createLogger('MyService');
const app = express();

app.use(corsMiddleware);
app.use(express.json());

app.get('/health', healthCheck('MyService', '1.0.0'));
app.get('/protected', authMiddleware, (req, res) => {
  logger.info('User accessed protected route', { userId: req.userId });
  res.json({ userId: req.userId });
});

app.use(notFoundHandler);
app.use(errorHandler);
```

## Migration Guide

### Replace database connections:
```javascript
// Before
const { Pool } = require('pg');
const pool = new Pool({ /* config */ });

// After
const { database } = require('@cointracer/shared');
const { pool, query } = database;
```

### Replace auth middleware:
```javascript
// Before
const authMiddleware = require('./middleware/auth');

// After
const { authMiddleware } = require('@cointracer/shared');
```

### Replace logging:
```javascript
// Before
console.log('Server started on port', port);

// After
const logger = createLogger('MyService');
logger.info('Server started', { port });
```
