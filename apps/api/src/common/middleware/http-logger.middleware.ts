import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const COLORS = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

const METHOD_COLORS: Record<string, string> = {
  GET: COLORS.cyan,
  POST: COLORS.green,
  PATCH: COLORS.yellow,
  PUT: COLORS.yellow,
  DELETE: COLORS.red,
  OPTIONS: COLORS.gray,
};

const IGNORE_PATHS = [/^\/health$/, /^\/metrics$/, /^\/favicon\.ico$/];

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  private readonly enabled = process.env.NODE_ENV !== 'production' && process.env.HTTP_LOG !== 'off';
  private readonly verboseBody = process.env.HTTP_LOG === 'verbose';

  use(req: Request, res: Response, next: NextFunction) {
    if (!this.enabled) return next();
    if (IGNORE_PATHS.some((r) => r.test(req.originalUrl.split('?')[0]))) return next();
    if (req.method === 'OPTIONS') return next();

    const start = Date.now();
    const method = req.method;
    const url = req.originalUrl;

    let responseBody: unknown;
    if (this.verboseBody) {
      const originalJson = res.json.bind(res);
      res.json = (body: unknown) => {
        responseBody = body;
        return originalJson(body);
      };
    }

    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      const methodColor = METHOD_COLORS[method] ?? COLORS.gray;
      const statusColor = this.getStatusColor(status);
      const durationColor = duration > 500 ? COLORS.red : duration > 200 ? COLORS.yellow : COLORS.dim;

      const line =
        `${methodColor}${method.padEnd(6)}${COLORS.reset}` +
        `${statusColor}${status}${COLORS.reset} ` +
        `${url}  ` +
        `${durationColor}${duration}ms${COLORS.reset}`;

      if (status >= 500) this.logger.error(line);
      else if (status >= 400) this.logger.warn(line);
      else this.logger.log(line);

      if (this.verboseBody && responseBody && status >= 400) {
        try {
          const str = JSON.stringify(responseBody).slice(0, 300);
          this.logger.debug(`  ${COLORS.dim}↳ ${str}${COLORS.reset}`);
        } catch {}
      }
    });

    next();
  }

  private getStatusColor(status: number): string {
    if (status >= 500) return COLORS.red + COLORS.bold;
    if (status >= 400) return COLORS.yellow;
    if (status >= 300) return COLORS.cyan;
    if (status >= 200) return COLORS.green;
    return COLORS.gray;
  }
}
