import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoupleMessage } from './entities/couple-message.entity';
import { CoupleMember } from './entities/couple-member.entity';

@Injectable()
export class CoupleChatService {
  constructor(
    @InjectRepository(CoupleMessage)
    private readonly messageRepo: Repository<CoupleMessage>,
    @InjectRepository(CoupleMember)
    private readonly coupleMemberRepo: Repository<CoupleMember>,
  ) {}

  async saveMessage(
    coupleId: number,
    senderId: number,
    content: string,
    metadata?: any,
  ): Promise<CoupleMessage> {
    const message = this.messageRepo.create({
      coupleId,
      senderId,
      content,
      metadata,
    });

    const saved = await this.messageRepo.save(message);

    // Retrieve saved message with sender profile
    const result = await this.messageRepo.findOne({
      where: { id: saved.id },
      relations: ['sender', 'sender.profile'],
    });

    if (!result) {
      throw new Error('Không thể tải lại tin nhắn vừa lưu');
    }

    return result;
  }

  async getChatHistory(
    coupleId: number,
    userId: number,
  ): Promise<CoupleMessage[]> {
    // Verify user belongs to the couple
    const member = await this.coupleMemberRepo.findOne({
      where: { coupleId, userId },
    });

    if (!member) {
      throw new ForbiddenException('Bạn không có quyền truy cập đoạn chat này.');
    }

    return this.messageRepo.find({
      where: { coupleId },
      relations: ['sender', 'sender.profile'],
      order: { createdAt: 'ASC' },
      take: 100, // Limit to last 100 messages for now
    });
  }

  async editMessage(
    messageId: number,
    userId: number,
    content: string,
  ): Promise<CoupleMessage> {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Không tìm thấy tin nhắn');
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa tin nhắn này');
    }

    message.content = content;
    const saved = await this.messageRepo.save(message);

    const result = await this.messageRepo.findOne({
      where: { id: saved.id },
      relations: ['sender', 'sender.profile'],
    });

    if (!result) {
      throw new Error('Không thể tải lại tin nhắn sau khi chỉnh sửa');
    }

    return result;
  }

  async deleteMessage(messageId: number, userId: number): Promise<void> {
    const message = await this.messageRepo.findOne({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException('Không tìm thấy tin nhắn');
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xóa tin nhắn này');
    }

    await this.messageRepo.remove(message);
  }
}
