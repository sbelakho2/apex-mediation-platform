import dotenv from 'dotenv';

dotenv.config();

const config = {
  isDevelopment: process.env.NODE_ENV === 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/apexmediation',
  // Add other config variables here
};

export default config;
