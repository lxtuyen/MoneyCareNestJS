/**
 * Bug Condition Exploration Tests — Task 1
 *
 * These tests are EXPECTED TO FAIL on unfixed code.
 * Failure confirms the bug exists and surfaces the counterexample.
 *
 * DO NOT fix the code when these tests fail.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as admin from 'firebase-admin';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType } from './entities/notification.entity';
import { DeviceToken } from './entities/device-token.entity';
import { User } from 'src/modules/user/entities/user.entity';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeUser(id = 1): User {
  const u = new User();
  u.id = id;
  u.email = 'test@example.com';
  return u;
}

function makeRepoMock<T>(): jest.Mocked<Repository<T>> {
  return {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>;
}

// ─── Bug 1: Firebase Admin SDK initialization ────────────────────────────────

describe('Bug 1 — Firebase Admin SDK initialization (EXPECTED FAIL on unfixed code)', () => {
  let service: NotificationsService;
  let notificationRepo: jest.Mocked<Repository<Notification>>;
  let deviceTokenRepo: jest.Mocked<Repository<DeviceToken>>;

  beforeEach(async () => {
    // Reset firebase-admin apps between tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin as any).apps.length = 0;

    notificationRepo = makeRepoMock<Notification>();
    deviceTokenRepo = makeRepoMock<DeviceToken>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: notificationRepo },
        { provide: getRepositoryToken(DeviceToken), useValue: deviceTokenRepo },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    // Clean up any initialized apps
    const apps = [...admin.apps];
    apps.forEach((app) => app?.delete());
  });

  /**
   * Bug Condition: no GOOGLE_APPLICATION_CREDENTIALS, no FIREBASE_SERVICE_ACCOUNT_PATH,
   * no FIREBASE_SERVICE_ACCOUNT_JSON in process.env.
   *
   * Expected (fixed): onModuleInit() does NOT throw, admin.apps.length == 0, warning is logged.
   * Actual (unfixed): applicationDefault() throws "Could not load the default credentials".
   *
   * Validates: Requirements 1.1
   */
  it('should NOT throw and should leave admin.apps empty when no Firebase credentials are configured', () => {
    // Arrange — strip all credential env vars
    const savedGAC = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const savedPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const savedJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    try {
      // Act — should not throw
      expect(() => service.onModuleInit()).not.toThrow();

      // Assert — SDK must NOT have been initialized
      expect(admin.apps.length).toBe(0);
    } finally {
      // Restore env
      if (savedGAC !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = savedGAC;
      if (savedPath !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT_PATH = savedPath;
      if (savedJson !== undefined) process.env.FIREBASE_SERVICE_ACCOUNT_JSON = savedJson;
    }
  });
});

// ─── Bug 2: TypeORM delete syntax for failed FCM tokens ──────────────────────

describe('Bug 2 — TypeORM delete syntax for failed FCM tokens (EXPECTED FAIL on unfixed code)', () => {
  let service: NotificationsService;
  let notificationRepo: jest.Mocked<Repository<Notification>>;
  let deviceTokenRepo: jest.Mocked<Repository<DeviceToken>>;

  beforeEach(async () => {
    notificationRepo = makeRepoMock<Notification>();
    deviceTokenRepo = makeRepoMock<DeviceToken>();

    // Stub notificationRepo.create / save
    notificationRepo.create.mockReturnValue({} as Notification);
    notificationRepo.save.mockResolvedValue({} as Notification);

    // Stub deviceTokenRepo.find — return one token
    const token = new DeviceToken();
    token.token = 'bad-token';
    deviceTokenRepo.find.mockResolvedValue([token]);

    // Stub deviceTokenRepo.delete
    deviceTokenRepo.delete.mockResolvedValue({ affected: 1, raw: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: notificationRepo },
        { provide: getRepositoryToken(DeviceToken), useValue: deviceTokenRepo },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);

    // Stub admin.messaging() to return 1 failure for 'bad-token'
    jest.spyOn(admin, 'messaging').mockReturnValue({
      sendEachForMulticast: jest.fn().mockResolvedValue({
        successCount: 0,
        failureCount: 1,
        responses: [{ success: false, error: { code: 'messaging/invalid-registration-token' } }],
      }),
    } as unknown as admin.messaging.Messaging);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Bug Condition: FCM multicast returns failureCount > 0 with token 'bad-token'.
   *
   * Expected (fixed): deviceTokenRepo.delete called with { token: In(['bad-token']) }
   * Actual (unfixed): deviceTokenRepo.delete called with [{ token: 'bad-token' }] (array of objects)
   *
   * Validates: Requirements 1.2
   */
  it('should call deviceTokenRepo.delete with { token: In([failedToken]) } syntax', async () => {
    const user = makeUser();

    await service.sendPushNotification(user, 'Test', 'Body');

    expect(deviceTokenRepo.delete).toHaveBeenCalledTimes(1);

    // The correct call uses In() operator — this assertion FAILS on unfixed code
    expect(deviceTokenRepo.delete).toHaveBeenCalledWith({ token: In(['bad-token']) });
  });
});

// ─── Bug 3: Notification type hardcoded as SYSTEM ────────────────────────────

describe('Bug 3 — Notification type hardcoded as SYSTEM (EXPECTED FAIL on unfixed code)', () => {
  let service: NotificationsService;
  let notificationRepo: jest.Mocked<Repository<Notification>>;
  let deviceTokenRepo: jest.Mocked<Repository<DeviceToken>>;

  beforeEach(async () => {
    notificationRepo = makeRepoMock<Notification>();
    deviceTokenRepo = makeRepoMock<DeviceToken>();

    notificationRepo.create.mockReturnValue({} as Notification);
    notificationRepo.save.mockResolvedValue({} as Notification);
    deviceTokenRepo.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: notificationRepo },
        { provide: getRepositoryToken(DeviceToken), useValue: deviceTokenRepo },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  /**
   * Bug Condition: sendPushNotification called without explicit type (as cron does).
   *
   * Expected (fixed): notificationRepo.create called with type = NotificationType.REMINDER
   *   (when caller passes REMINDER, or when a default-REMINDER overload is used)
   * Actual (unfixed): type is always hardcoded to NotificationType.SYSTEM
   *
   * This test simulates the cron caller passing REMINDER — on unfixed code the function
   * signature has no type param so it cannot accept REMINDER, and create() always gets SYSTEM.
   *
   * Validates: Requirements 1.3
   */
  it('should create notification with type REMINDER when called without explicit type (cron scenario)', async () => {
    const user = makeUser();

    // On fixed code, cron passes NotificationType.REMINDER as 5th arg.
    // We assert the DESIRED behavior: type should be REMINDER when caller passes REMINDER.
    await service.sendPushNotification(user, 'Reminder title', 'Reminder body', undefined, NotificationType.REMINDER);

    expect(notificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: NotificationType.REMINDER }),
    );
  });
});
