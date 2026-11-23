import { env } from './config/env';
import { createApp } from './createApp';
import { connectDatabase, disconnectDatabase } from './config/db';
import { seedAdmin } from './seed/seedAdmin';

async function bootstrap() {
  await connectDatabase();
  await seedAdmin();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`🚀 WorkBrief AI API listening on http://localhost:${env.PORT}/api`);
    console.log(`   CORS origins: ${env.corsOrigins.join(', ')}`);
    console.log(
      `   AI: ${env.GEMINI_API_KEY ? `Gemini (${env.GEMINI_MODEL})` : env.AI_MOCK_FALLBACK ? 'mock fallback (no GEMINI_API_KEY)' : 'disabled'}`,
    );
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
