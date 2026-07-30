import express from 'express';
import cors from 'cors';

import authRouter from './routes/auth.router';
import trackerRouter from './routes/tracker.router';
import goalRouter from './routes/goal.router';
import insightRouter from './routes/insight.router';
import exportRouter from './routes/export.router';
import reminderRouter from './routes/reminder.router';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler';

const app = express();

// Native mobile requests (iOS/Android) don't send an Origin header, so CORS
// only matters for web/browser clients (e.g. Expo web during development).
// Configure allowed origins via CORS_ORIGIN (comma-separated). Falls back to
// common local Expo web dev ports if unset.
const allowedOrigins = (
  process.env['CORS_ORIGIN'] ?? 'http://localhost:8081,http://localhost:19006'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (native apps, curl, server-to-server).
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/trackers', trackerRouter);
app.use('/goals', goalRouter);
app.use('/insights', insightRouter);
app.use('/exports', exportRouter);
app.use('/reminders', reminderRouter);

// Must be mounted last: 404 fallback, then the global error handler.
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
