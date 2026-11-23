import mongoose from 'mongoose';
import { env } from './env';

export async function connectDatabase(): Promise<void> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => console.log('🔁 MongoDB reconnected'));

  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  const { host, port, name } = mongoose.connection;
  console.log(`✅ MongoDB connected: ${host}:${port}/${name}`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
