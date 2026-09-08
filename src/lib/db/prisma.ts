import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Safely executes a database query with fallback if database is not reachable
 * during initial configuration phase.
 */
export async function safeDbQuery<T>(
  queryFn: () => Promise<T>,
  fallbackValue: T
): Promise<T> {
  try {
    return await queryFn();
  } catch (error) {
    // Only warn once in development if database connection fails
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[Database Notice] Unable to reach PostgreSQL. Providing zero/empty state. Configure DATABASE_URL in .env once database is ready.',
        error instanceof Error ? error.message : error
      );
    }
    return fallbackValue;
  }
}
