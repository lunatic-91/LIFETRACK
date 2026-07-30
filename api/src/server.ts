import app from './index';

const PORT = process.env.PORT || 3000;

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[LifeTrack API] Server is running on port ${PORT}`);
});
