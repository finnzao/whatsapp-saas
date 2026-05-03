import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { WhatsappService } from './whatsapp.service';

interface ActiveTyping {
  tenantId: string;
  to: string;
  intervalHandle: ReturnType<typeof setInterval>;
  expiresAt: number;
}

@Injectable()
export class WhatsappPresenceService implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsappPresenceService.name);
  private readonly active = new Map<string, ActiveTyping>();
  private readonly refreshDelayMs: number;
  private readonly maxLifetimeMs: number;

  constructor(
    private readonly whatsapp: WhatsappService,
    config: ConfigService,
  ) {
    this.refreshDelayMs = Number(config.get<string>('PRESENCE_REFRESH_MS', '8000'));
    this.maxLifetimeMs = Number(config.get<string>('PRESENCE_MAX_LIFETIME_MS', '120000'));
  }

  onModuleDestroy() {
    for (const entry of this.active.values()) {
      clearInterval(entry.intervalHandle);
    }
    this.active.clear();
  }

  async startTyping(tenantId: string, to: string): Promise<void> {
    const key = this.key(tenantId, to);
    const existing = this.active.get(key);
    if (existing) {
      existing.expiresAt = Date.now() + this.maxLifetimeMs;
      return;
    }

    await this.whatsapp.sendPresence(tenantId, to, 'composing', this.refreshDelayMs * 2);

    const handle = setInterval(() => {
      const entry = this.active.get(key);
      if (!entry) return;
      if (Date.now() >= entry.expiresAt) {
        this.logger.debug(`[presence] expirou max lifetime para ${to}, parando`);
        void this.stopTyping(tenantId, to);
        return;
      }
      void this.whatsapp.sendPresence(tenantId, to, 'composing', this.refreshDelayMs * 2);
    }, this.refreshDelayMs);

    this.active.set(key, {
      tenantId,
      to,
      intervalHandle: handle,
      expiresAt: Date.now() + this.maxLifetimeMs,
    });
  }

  async stopTyping(tenantId: string, to: string): Promise<void> {
    const key = this.key(tenantId, to);
    const entry = this.active.get(key);
    if (!entry) return;

    clearInterval(entry.intervalHandle);
    this.active.delete(key);

    await this.whatsapp.sendPresence(tenantId, to, 'available', 0);
  }

  isTyping(tenantId: string, to: string): boolean {
    return this.active.has(this.key(tenantId, to));
  }

  private key(tenantId: string, to: string): string {
    return `${tenantId}::${to}`;
  }
}
