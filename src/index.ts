import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { prisma } from './db/client'; // <-- CHANGE to this
import passport from 'passport';
import { configurePassport } from './config/passport';

import { PrismaClient } from '@prisma/client';

import authRoutes from './routes/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
console.log("RESTARTED")
app.use(helmet());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true, 
  })
);

app.use(morgan('combined'));

app.use(express.json({ limit: '10mb' }));

app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

app.use(passport.initialize());
configurePassport(passport); 


app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.use('/auth', authRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Sarvasync REST API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/auth',
    },
  });
});

app.use(
  (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack); // Log the full error stack for debugging.
    res.status(500).json({
      error: 'Something went wrong!',
      // Only show detailed error messages in development for security.
      message: process.env.NODE_ENV === 'development' ? err.message : 'An internal server error occurred.',
    });
  }
);

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `The route ${req.method} ${req.originalUrl} does not exist.`,
  });
});

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));


app.listen(PORT, () => {
  console.log('--- Server is Up and Running ---');
  console.log(`🚀 Listening on port: ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health Check: http://localhost:${PORT}/health`);
  console.log('---------------------------------');
});

export default app;