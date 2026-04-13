import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { CacheService } from './cache.service';

type RedisHandler = (error?: Error) => void;

let mockRedisClient: {
  on: jest.Mock;
  connect: jest.Mock;
  quit: jest.Mock;
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  scanIterator: jest.Mock;
  isOpen: boolean;
};
let redisHandlers: Record<string, RedisHandler>;

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

function createConfigService(values: Record<string, unknown>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function createRedisClient() {
  redisHandlers = {};
  mockRedisClient = {
    on: jest.fn((event: string, handler: RedisHandler) => {
      redisHandlers[event] = handler;
      return mockRedisClient;
    }),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    scanIterator: jest.fn(async function* () {}),
    isOpen: true,
  };
}

describe('CacheService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    createRedisClient();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('uses in-memory cache when Redis is not configured', async () => {
    const service = new CacheService(createConfigService({}));

    await service.onModuleInit();
    await service.set('memory:key', { ok: true }, 60);

    await expect(service.get<{ ok: boolean }>('memory:key')).resolves.toEqual({
      ok: true,
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('expires in-memory entries by TTL', async () => {
    const service = new CacheService(createConfigService({}));

    await service.onModuleInit();
    await service.set('memory:ttl', 'value', 1);
    jest.advanceTimersByTime(1001);

    await expect(service.get('memory:ttl')).resolves.toBeNull();
  });

  it('does not fall back to memory when Redis get fails at runtime', async () => {
    const service = new CacheService(
      createConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );

    await service.onModuleInit();
    mockRedisClient.get.mockRejectedValueOnce(new Error('boom'));

    await expect(service.get('redis:key')).resolves.toBeNull();

    await service.set('redis:key', 'value', 60);
    await expect(service.get('redis:key')).resolves.toBeNull();
  });

  it('degrades Redis write/delete failures into no-op without throwing', async () => {
    const service = new CacheService(
      createConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );

    await service.onModuleInit();
    mockRedisClient.set.mockRejectedValueOnce(new Error('set failed'));
    await expect(service.set('redis:key', 'value', 60)).resolves.toBeUndefined();

    redisHandlers.ready?.();
    mockRedisClient.del.mockRejectedValueOnce(new Error('del failed'));
    await expect(service.del('redis:key')).resolves.toBeUndefined();

    redisHandlers.ready?.();
    mockRedisClient.del.mockRejectedValueOnce(new Error('delMany failed'));
    await expect(service.delMany(['a', 'b'])).resolves.toBeUndefined();
  });

  it('uses Redis again after a reconnect event', async () => {
    const service = new CacheService(
      createConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );

    await service.onModuleInit();
    redisHandlers.error?.(new Error('temporary failure'));

    mockRedisClient.get.mockResolvedValueOnce(JSON.stringify({ ok: true }));
    await expect(service.get<{ ok: boolean }>('redis:key')).resolves.toBeNull();

    redisHandlers.ready?.();

    await expect(service.get<{ ok: boolean }>('redis:key')).resolves.toEqual({
      ok: true,
    });
  });
});
