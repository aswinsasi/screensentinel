import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { config } from './config';
import { tokenRouter } from './routes/token';
import { healthRouter } from './routes/health';
import { authenticate } from './middleware/auth';
import { rateLimit } from './middleware/rateLimit';
import { logger } from './services/logger';

const app = express();

// ─── Global Middleware ───

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

// ─── Routes ───
app.use('/health', healthRouter);
app.use('/api/v1/token', authenticate, rateLimit, tokenRouter);

// ─── Error Handler ───
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Server ───
const server = app.listen(config.port, () => {
  logger.info(`Token service running on port ${config.port}`);
});

// ─── Graceful Shutdown ───
const shutdown = (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app };
