import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { QUEUE_NAMES, JOB_NAMES } from '../../queue/queue.constants';

export interface DebouncedMessageContext {
  tenantId: string;
  conversationId: string;
  contactId: string;
  phone: string;
  instanceName: string | null;
  messageId: string;
  messageText: string;
  isDebug?: boolean;
}

interface DebounceState {
  tenantId: string;
  conversationId: string;
  contactId: string;
  phone: string;
  instanceName: string | null;
  isDebug: boolean;
  firstAt: number;
  count: number;
}

const STATE_KEY_PREFIX = 'debounce:state:';
const MSGS_KEY_PREFIX = 'debounce:msgs:';
const LOCK_KEY_PREFIX = 'debounce:lock:';

function buildJobId(conversationId: string): string {
  return `debounce-${conversationId}`;
}

@Injectable()
export class InboundDebouncerService {
  private readonly logger = new Logger(InboundDebouncerService.name);
  private readonly redis: Redis;
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly maxMessages: number;
  private readonly stateTtlSeconds: number;

  constructor(
    @InjectQueue(QUEUE_NAMES.DEBOUNCED_PROCESSING)
    private readonly queue: Queue,
    config: ConfigService,
  ) {
    this.debounceMs = Number(config.get<string>('INBOUND_DEBOUNCE_MS', '5000'));
    this.maxWaitMs = Number(config.get<string>('INBOUND_DEBOUNCE_MAX_MS', '30000'));
    this.maxMessages = Number(config.get<string>('INBOUND_DEBOUNCE_MAX_MESSAGES', '20'));
    this.stateTtlSeconds = Math.ceil((this.maxWaitMs + 60_000) / 1000);

    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: Number(config.get<string>('REDIS_PORT', '6379')),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: null,
    });
  }

  async enqueue(ctx: DebouncedMessageContext): Promise<void> {
    const lockKey = `${LOCK_KEY_PREFIX}${ctx.conversationId}`;
    const lockAcquired = await this.redis.set(lockKey, '1', 'PX', 5_000, 'NX');
    if (!lockAcquired) {
      await this.sleep(50);
      return this.enqueue(ctx);
    }

    try {
      await this.appendMessage(ctx);
      const state = await this.loadOrCreateState(ctx);

      const elapsed = Date.now() - state.firstAt;
      const shouldFireNow =
        elapsed >= this.maxWaitMs || state.count >= this.maxMessages;

      if (shouldFireNow) {
        this.logger.log(
          `[debouncer] FIRE NOW conv=${ctx.conversationId} count=${state.count} elapsed=${elapsed}ms reason=${
            state.count >= this.maxMessages ? 'max_messages' : 'max_wait'
          }`,
        );
        await this.scheduleJob(ctx.conversationId, 0);
      } else {
        await this.scheduleJob(ctx.conversationId, this.debounceMs);
        this.logger.debug(
          `[debouncer] enqueue conv=${ctx.conversationId} msg=${ctx.messageId} count=${state.count} elapsed=${elapsed}ms reset_timer=${this.debounceMs}ms`,
        );
      }
    } finally {
      await this.redis.del(lockKey);
    }
  }

  async drain(conversationId: string): Promise<{
    state: DebounceState | null;
    messageIds: string[];
  }> {
    const stateKey = `${STATE_KEY_PREFIX}${conversationId}`;
    const msgsKey = `${MSGS_KEY_PREFIX}${conversationId}`;

    const lockKey = `${LOCK_KEY_PREFIX}${conversationId}`;
    const lockAcquired = await this.redis.set(lockKey, '1', 'PX', 5_000, 'NX');
    if (!lockAcquired) {
      await this.sleep(100);
      return this.drain(conversationId);
    }

    try {
      const stateRaw = await this.redis.get(stateKey);
      if (!stateRaw) return { state: null, messageIds: [] };

      const messageIds = await this.redis.lrange(msgsKey, 0, -1);
      await this.redis.del(stateKey, msgsKey);

      return {
        state: JSON.parse(stateRaw) as DebounceState,
        messageIds,
      };
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private async appendMessage(ctx: DebouncedMessageContext): Promise<void> {
    const msgsKey = `${MSGS_KEY_PREFIX}${ctx.conversationId}`;
    const pipe = this.redis.multi();
    pipe.rpush(msgsKey, ctx.messageId);
    pipe.expire(msgsKey, this.stateTtlSeconds);
    await pipe.exec();
  }

  private async loadOrCreateState(ctx: DebouncedMessageContext): Promise<DebounceState> {
    const stateKey = `${STATE_KEY_PREFIX}${ctx.conversationId}`;
    const existing = await this.redis.get(stateKey);

    if (existing) {
      const state = JSON.parse(existing) as DebounceState;
      state.count += 1;
      await this.redis.set(stateKey, JSON.stringify(state), 'EX', this.stateTtlSeconds);
      return state;
    }

    const fresh: DebounceState = {
      tenantId: ctx.tenantId,
      conversationId: ctx.conversationId,
      contactId: ctx.contactId,
      phone: ctx.phone,
      instanceName: ctx.instanceName,
      isDebug: ctx.isDebug ?? false,
      firstAt: Date.now(),
      count: 1,
    };
    await this.redis.set(stateKey, JSON.stringify(fresh), 'EX', this.stateTtlSeconds);
    return fresh;
  }

  private async scheduleJob(conversationId: string, delayMs: number): Promise<void> {
    const jobId = buildJobId(conversationId);

    try {
      await this.queue.remove(jobId);
    } catch {
    }

    await this.queue.add(
      JOB_NAMES.PROCESS_DEBOUNCED,
      { conversationId },
      {
        jobId,
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: { count: 50, age: 86_400 },
        attempts: 1,
      },
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}