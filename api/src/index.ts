import express from 'express';

import authRouter from './routes/auth.router';
import trackerRouter from './routes/tracker.router';
import goalRouter from './routes/goal.router';
import insightRouter from './routes/insight.router';
import exportRouter from './routes/export.router';
import reminderRouter from './routes/reminder.router';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler';

const app = express();

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
