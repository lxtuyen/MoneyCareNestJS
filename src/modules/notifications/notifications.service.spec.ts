import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';

type MockRepository<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

const createMockRepository = <T extends object>(): MockRepository<T> => ({
  create: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
});

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationRepo: MockRepository<Notification>;

  beforeEach(async () => {
    notificationRepo = createMockRepository<Notification>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(Notification),
          useValue: notificationRepo,
        },
      ],
    }).compile();

    service = moduleRef.get(NotificationsService);
  });

  it('creates an in-app notification without device tokens', async () => {
    const user = { id: 1 } as User;
    const createdNotification = {
      title: 'Title',
      body: 'Body',
      type: NotificationType.SYSTEM,
      user,
    } as Notification;
    const savedNotification = { ...createdNotification, id: 10 };

    notificationRepo.create?.mockReturnValue(createdNotification);
    notificationRepo.save?.mockResolvedValue(savedNotification);

    await expect(
      service.sendPushNotification(user, 'Title', 'Body'),
    ).resolves.toEqual({
      success: true,
      notification: savedNotification,
      pushSkipped: true,
      data: undefined,
    });

    expect(notificationRepo.create).toHaveBeenCalledWith({
      title: 'Title',
      body: 'Body',
      type: NotificationType.SYSTEM,
      user,
    });
    expect(notificationRepo.save).toHaveBeenCalledWith(createdNotification);
  });
});
