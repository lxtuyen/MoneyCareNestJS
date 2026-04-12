import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

type MemoryCacheEntry = {
  value: string;
  expiresAt: number | null;
};

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly memoryCache = new Map<string, MemoryCacheEntry>();
  private redisClient: ReturnType<typeof createClient> | null = null;
  private redisReady = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    const redisHost = this.configService.get<string>('REDIS_HOST');

    if (!redisUrl && !redisHost) {
      this.logger.log(
        'Redis is not configured. Falling back to in-memory cache.',
      );
      return;
    }

    try {
      const client = createClient(
        redisUrl
          ? { url: redisUrl }
          : {
              socket: {
                host: redisHost,
                port: this.configService.get<number>('REDIS_PORT') ?? 6379,
              },
              password: this.configService.get<string>('REDIS_PASSWORD'),
            },
      );

      client.on('error', (error) => {
        this.redisReady = false;
        this.logger.error(`Redis error: ${error.message}`);
      });

      await client.connect();
      this.redisClient = client;
      this.redisReady = true;
      this.logger.log('Connected to Redis cache.');
    } catch (error) {
      this.redisReady = false;
      this.redisClient = null;
      this.logger.warn(
        `Redis connection failed. Falling back to in-memory cache. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient?.isOpen) {
      await this.redisClient.quit();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.redisReady && this.redisClient) {
      const value = await this.redisClient.get(key);
      return value ? (JSON.parse(value) as T) : null;
    }

    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.memoryCache.delete(key);
      return null;
    }

    return JSON.parse(entry.value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const payload = JSON.stringify(value);

    if (this.redisReady && this.redisClient) {
      await this.redisClient.set(key, payload, { EX: ttlSeconds });
      return;
    }

    this.memoryCache.set(key, {
      value: payload,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    if (this.redisReady && this.redisClient) {
      await this.redisClient.del(key);
      return;
    }

    this.memoryCache.delete(key);
  }

  async delMany(keys: string[]): Promise<void> {
    const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
    if (uniqueKeys.length === 0) return;

    if (this.redisReady && this.redisClient) {
      await this.redisClient.del(uniqueKeys);
      return;
    }

    uniqueKeys.forEach((key) => this.memoryCache.delete(key));
  }

  async delByPrefix(prefix: string): Promise<void> {
    if (!prefix) return;

    if (this.redisReady && this.redisClient) {
      const keysToDelete: string[] = [];
      for await (const key of this.redisClient.scanIterator({
        MATCH: `${prefix}*`,
        COUNT: 100,
      })) {
        if (Array.isArray(key)) {
          keysToDelete.push(...(key as string[]));
        } else {
          keysToDelete.push(key as unknown as string);
        }
      }
      if (keysToDelete.length > 0) {
        await this.redisClient.del(keysToDelete);
      }
      return;
    }

    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(prefix)) {
        this.memoryCache.delete(key);
      }
    }
  }
}
