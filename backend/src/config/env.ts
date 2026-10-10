import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().optional().default(''),
  ML_SERVICE_URL: z.string().default('http://localhost:8000'),
  JWT_SECRET: z.string().default('super_secret_hackmatrix_jwt_token_2026'),
  ANTHROPIC_API_KEY: z.string().optional().default('')
});

export const env = envSchema.parse(process.env);
