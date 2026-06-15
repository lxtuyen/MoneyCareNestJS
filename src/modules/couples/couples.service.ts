import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getTodayStringInTimeZone } from 'src/common/utils/date.util';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Couple, CoupleStatus } from './entities/couple.entity';
import { CoupleMember, CoupleRole } from './entities/couple-member.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import {
  CoupleResponseDto,
  CoupleMemberResponseDto,
} from './dto/couple-response.dto';

@Injectable()
export class CouplesService {
  constructor(
    @InjectRepository(Couple)
    private readonly coupleRepo: Repository<Couple>,
    @InjectRepository(CoupleMember)
    private readonly coupleMemberRepo: Repository<CoupleMember>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
  ) {}

  private async generateInviteCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    let isUnique = false;
    while (!isUnique) {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const existing = await this.coupleRepo.findOne({
        where: { inviteCode: code },
      });
      if (!existing) {
        isUnique = true;
      }
    }
    return code;
  }

  private mapToResponse(couple: Couple): CoupleResponseDto {
    const dto = new CoupleResponseDto();
    dto.id = couple.id;
    dto.inviteCode = couple.inviteCode;
    dto.status = couple.status;
    dto.createdAt = couple.createdAt;
    dto.updatedAt = couple.updatedAt;
    dto.currentStreak = couple.currentStreak ?? 0;
    dto.lastActivityDate = couple.lastActivityDate;
    dto.members = (couple.members ?? []).map((m) => {
      const memberDto = new CoupleMemberResponseDto();
      memberDto.userId = m.userId;
      memberDto.email = m.user?.email ?? '';
      memberDto.firstName = m.user?.profile?.first_name;
      memberDto.lastName = m.user?.profile?.last_name;
      memberDto.avatar = m.user?.profile?.avatar;
      memberDto.role = m.role;
      memberDto.sharePersonalTransactions = m.sharePersonalTransactions;
      memberDto.allowAiShare = m.allowAiShare;
      memberDto.joinedAt = m.joinedAt;
      return memberDto;
    });
    return dto;
  }

  async create(userId: number): Promise<CoupleResponseDto> {
    // Check if user is already in a pending or active couple
    const activeMember = await this.coupleMemberRepo.findOne({
      where: {
        userId,
        couple: {
          status: In([CoupleStatus.PENDING, CoupleStatus.ACTIVE]),
        },
      },
      relations: ['couple'],
    });

    if (activeMember) {
      throw new BadRequestException(
        'Bạn đã ở trong một không gian cặp đôi hoặc đang có lời mời chờ.',
      );
    }

    const inviteCode = await this.generateInviteCode();
    const couple = this.coupleRepo.create({
      inviteCode,
      status: CoupleStatus.PENDING,
    });

    const savedCouple = await this.coupleRepo.save(couple);

    const member = this.coupleMemberRepo.create({
      coupleId: savedCouple.id,
      userId,
      role: CoupleRole.OWNER,
      sharePersonalTransactions: false,
      allowAiShare: false,
    });

    await this.coupleMemberRepo.save(member);

    // Retrieve fully populated couple
    const result = await this.coupleRepo.findOne({
      where: { id: savedCouple.id },
      relations: ['members', 'members.user', 'members.user.profile'],
    });

    if (!result) {
      throw new Error('Lỗi khi tải lại thông tin Couple vừa tạo');
    }

    return this.mapToResponse(result);
  }

  async join(userId: number, inviteCode: string): Promise<CoupleResponseDto> {
    // Check if user is already in a pending or active couple
    const activeMember = await this.coupleMemberRepo.findOne({
      where: {
        userId,
        couple: {
          status: In([CoupleStatus.PENDING, CoupleStatus.ACTIVE]),
        },
      },
    });

    if (activeMember) {
      throw new BadRequestException(
        'Bạn đã ở trong một không gian cặp đôi hoặc đang có lời mời chờ.',
      );
    }

    const couple = await this.coupleRepo.findOne({
      where: { inviteCode, status: CoupleStatus.PENDING },
      relations: ['members'],
    });

    if (!couple) {
      throw new NotFoundException(
        'Không tìm thấy lời mời hợp lệ với mã mời này.',
      );
    }

    if (couple.members && couple.members.length >= 2) {
      throw new BadRequestException('Không gian cặp đôi này đã đầy.');
    }

    // Add partner
    const member = this.coupleMemberRepo.create({
      coupleId: couple.id,
      userId,
      role: CoupleRole.PARTNER,
      sharePersonalTransactions: false,
      allowAiShare: false,
    });

    await this.coupleMemberRepo.save(member);

    couple.status = CoupleStatus.ACTIVE;
    delete (couple as any).members;
    await this.coupleRepo.save(couple);

    // Create default shared wallet
    const defaultWallet = this.walletRepo.create({
      name: 'Ví chung',
      balance: 0,
      couple: { id: couple.id } as Couple,
    });
    await this.walletRepo.save(defaultWallet);

    // Retrieve fully populated couple
    const result = await this.coupleRepo.findOne({
      where: { id: couple.id },
      relations: ['members', 'members.user', 'members.user.profile'],
    });

    if (!result) {
      throw new Error('Lỗi khi tải thông tin Couple sau khi tham gia');
    }

    return this.mapToResponse(result);
  }

  async cancelInvite(userId: number): Promise<void> {
    const member = await this.coupleMemberRepo.findOne({
      where: {
        userId,
        role: CoupleRole.OWNER,
        couple: {
          status: CoupleStatus.PENDING,
        },
      },
      relations: ['couple'],
    });

    if (!member) {
      throw new NotFoundException('Không tìm thấy lời mời chờ để hủy.');
    }

    const couple = member.couple;
    couple.status = CoupleStatus.CANCELLED;
    await this.coupleRepo.save(couple);
  }

  async leaveCouple(userId: number): Promise<void> {
    const member = await this.coupleMemberRepo.findOne({
      where: {
        userId,
        couple: {
          status: CoupleStatus.ACTIVE,
        },
      },
      relations: ['couple'],
    });

    if (!member) {
      throw new NotFoundException(
        'Bạn không ở trong không gian cặp đôi đang hoạt động nào.',
      );
    }

    const couple = member.couple;
    couple.status = CoupleStatus.LEFT;
    await this.coupleRepo.save(couple);
  }

  async getMe(userId: number): Promise<CoupleResponseDto | null> {
    const member = await this.coupleMemberRepo.findOne({
      where: {
        userId,
        couple: {
          status: In([CoupleStatus.PENDING, CoupleStatus.ACTIVE]),
        },
      },
      relations: ['couple'],
    });

    if (!member) {
      return null;
    }

    const couple = await this.coupleRepo.findOne({
      where: { id: member.coupleId },
      relations: ['members', 'members.user', 'members.user.profile'],
    });

    return couple ? this.mapToResponse(couple) : null;
  }

  async updateSettings(
    userId: number,
    dto: UpdateSettingsDto,
  ): Promise<CoupleResponseDto> {
    const member = await this.coupleMemberRepo.findOne({
      where: {
        userId,
        couple: {
          status: CoupleStatus.ACTIVE,
        },
      },
      relations: ['couple'],
    });

    if (!member) {
      throw new NotFoundException(
        'Không tìm thấy thiết lập thành viên cho không gian cặp đôi đang hoạt động.',
      );
    }

    if (dto.sharePersonalTransactions !== undefined) {
      member.sharePersonalTransactions = dto.sharePersonalTransactions;
    }
    if (dto.allowAiShare !== undefined) {
      member.allowAiShare = dto.allowAiShare;
    }

    await this.coupleMemberRepo.save(member);

    const couple = await this.coupleRepo.findOne({
      where: { id: member.coupleId },
      relations: ['members', 'members.user', 'members.user.profile'],
    });

    if (!couple) {
      throw new Error('Lỗi khi tải lại thông tin Couple sau khi thiết lập');
    }

    return this.mapToResponse(couple);
  }

  async getActiveCoupleForUser(userId: number): Promise<Couple | null> {
    const member = await this.coupleMemberRepo.findOne({
      where: {
        userId,
        couple: {
          status: CoupleStatus.ACTIVE,
        },
      },
      relations: ['couple'],
    });
    return member ? member.couple : null;
  }

  async canAccessPartnerData(
    requestUserId: number,
    targetUserId: number,
    type: 'api' | 'ai',
  ): Promise<boolean> {
    if (requestUserId === targetUserId) {
      return true;
    }

    // Find if both are in the same active couple
    const activeCoupleForTarget = await this.coupleMemberRepo.findOne({
      where: {
        userId: targetUserId,
        couple: {
          status: CoupleStatus.ACTIVE,
        },
      },
    });

    if (!activeCoupleForTarget) {
      return false;
    }

    const requestUserInSameCouple = await this.coupleMemberRepo.findOne({
      where: {
        userId: requestUserId,
        coupleId: activeCoupleForTarget.coupleId,
      },
    });

    if (!requestUserInSameCouple) {
      return false;
    }

    // Check target user's privacy setting
    return type === 'api'
      ? activeCoupleForTarget.sharePersonalTransactions
      : activeCoupleForTarget.allowAiShare;
  }

  async getCoupleMembers(coupleId: number): Promise<CoupleMember[]> {
    return this.coupleMemberRepo.find({
      where: { coupleId },
      relations: ['user', 'user.profile'],
    });
  }

  async updateStreak(
    coupleId: number,
  ): Promise<{ currentStreak: number; lastActivityDate: string | null } | null> {
    const couple = await this.coupleRepo.findOne({ where: { id: coupleId } });
    if (!couple || couple.status !== CoupleStatus.ACTIVE) return null;

    const todayStr = getTodayStringInTimeZone();
    const lastActivity = couple.lastActivityDate;

    const newStreak = this.calculateNewStreak(
      couple.currentStreak ?? 0,
      lastActivity,
      todayStr,
    );

    const isNewDay = !lastActivity || todayStr > lastActivity;

    if (isNewDay) {
      couple.currentStreak = newStreak;
      couple.lastActivityDate = todayStr;
      const saved = await this.coupleRepo.save(couple);
      return {
        currentStreak: saved.currentStreak,
        lastActivityDate: saved.lastActivityDate,
      };
    }

    return {
      currentStreak: couple.currentStreak,
      lastActivityDate: couple.lastActivityDate,
    };
  }

  private calculateNewStreak(
    currentStreak: number,
    lastActivityDate: string | null,
    todayStr: string,
  ): number {
    if (!lastActivityDate) {
      return 1;
    }

    const last = new Date(lastActivityDate);
    const current = new Date(todayStr);

    const diffMs = current.getTime() - last.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return currentStreak;
    } else if (diffDays === 1) {
      return currentStreak + 1;
    } else {
      return 1;
    }
  }
}
