import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.TOKEN_SERVICE_PORT || '3001', 10),
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
  jwtPrivateKeyPath: process.env.JWT_PRIVATE_KEY_PATH || '.keys/private.pem',
  jwtPublicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || '.keys/public.pem',
  serverSecret: process.env.SERVER_SECRET || 'change_me_in_production',
  tokenTtlSeconds: parseInt(process.env.TOKEN_TTL_SECONDS || '300', 10),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/screensentinel',
  rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '100', 10),
};
