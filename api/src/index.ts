import express from 'express';

import authRouter from './routes/auth.router';
import trackerRouter from './routes/tracker.router';
import goalRouter from './routes/goal.router';
import insightRouter from './routes/insight.router';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/trackers', trackerRouter);
app.use('/goals', goalRouter);
app.use('/insights', insightRouter);

export default app;
