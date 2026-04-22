import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

function buildLogConfig(): Prisma.LogLevel[] | Prisma.LogDefinition[] {
  const isDev = process.env.NODE_ENV !== 'production';
  const verbose = process.env.PRISMA_LOG === 'query' || process.env.PRISMA_LOG === 'verbose';

  if (verbose) {
    return [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'event' },
      { level: 'warn', emit: 'event' },
      { level: 'info', emit: 'event' },
    ];
  }

  if (isDev) {
    return [
      { level: 'error', emit: 'event' },
      { level: 'warn', emit: 'event' },
    ];
  }

  return [{ level: 'error', emit: 'event' }];
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Prisma');

  constructor() {
    super({
      log: buildLogConfig() as any,
      errorFormat: process.env.NODE_ENV === 'production' ? 'minimal' : 'colorless',
    });
  }

  async onModuleInit() {
    if (process.env.PRISMA_LOG === 'query' || process.env.PRISMA_LOG === 'verbose') {
      (this as any).$on('query', (e: Prisma.QueryEvent) => {
        const duration = e.duration;
        const colorTag = duration > 200 ? '🐌' : duration > 50 ? '⚠️ ' : '';
        this.logger.debug(`${colorTag}${duration}ms  ${this.summarizeQuery(e.query)}`);
      });
    }

    (this as any).$on('error', (e: Prisma.LogEvent) => {
      this.logger.error(e.message);
    });

    (this as any).$on('warn', (e: Prisma.LogEvent) => {
      this.logger.warn(e.message);
    });

    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private summarizeQuery(query: string): string {
    const normalized = query.replace(/\s+/g, ' ').trim();
    const match = normalized.match(/^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)/i);
    const verb = match ? match[1].toUpperCase() : '?';

    const tableMatch =
      normalized.match(/FROM\s+"public"\."(\w+)"/i) ??
      normalized.match(/INTO\s+"public"\."(\w+)"/i) ??
      normalized.match(/UPDATE\s+"public"\."(\w+)"/i);
    const table = tableMatch?.[1] ?? '';

    return table ? `${verb} ${table}` : verb;
  }
}
