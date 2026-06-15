import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { CoupleChatService } from './couple-chat.service';
import { CouplesService } from './couples.service';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'couple-chat',
})
export class CoupleChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(CoupleChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly couplesService: CouplesService,
    private readonly chatService: CoupleChatService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Get JWT from auth token, query or authorization header
      let token =
        client.handshake.auth?.token ||
        client.handshake.query?.token ||
        client.handshake.headers?.authorization;

      if (token && typeof token === 'string' && token.startsWith('Bearer ')) {
        token = token.slice(7);
      }

      if (!token) {
        this.logger.warn(`Client connection rejected: No token provided.`);
        client.disconnect();
        return;
      }

      // Verify token
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      if (!userId) {
        this.logger.warn(`Client connection rejected: Invalid payload.`);
        client.disconnect();
        return;
      }

      // Check user's active couple
      const couple = await this.couplesService.getActiveCoupleForUser(userId);
      if (!couple) {
        this.logger.warn(`Client connection rejected: User ${userId} is not in an active couple.`);
        client.disconnect();
        return;
      }

      // Save user info on socket client
      client.data = { userId, coupleId: couple.id };

      // Join client to couple room
      const roomName = `couple_${couple.id}`;
      client.join(roomName);
      this.logger.log(`User ${userId} connected to couple room ${roomName}`);
    } catch (err) {
      this.logger.error(`Authentication error during WS connection: ${err}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    const coupleId = client.data?.coupleId;
    if (userId && coupleId) {
      this.logger.log(`User ${userId} disconnected from couple room couple_${coupleId}`);
    }
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { content: string; metadata?: any },
  ) {
    const userId = client.data?.userId;
    const coupleId = client.data?.coupleId;

    if (!userId || !coupleId) {
      this.logger.warn(`sendMessage rejected: socket client not authenticated.`);
      return;
    }

    if (!data?.content || data.content.trim() === '') {
      return;
    }

    try {
      const savedMessage = await this.chatService.saveMessage(
        coupleId,
        userId,
        data.content,
        data.metadata,
      );

      // Update Couple Streak
      const streakInfo = await this.couplesService.updateStreak(coupleId);

      const roomName = `couple_${coupleId}`;
      this.server.to(roomName).emit('receiveMessage', savedMessage);

      if (streakInfo) {
        this.server.to(roomName).emit('streakUpdated', streakInfo);
      }
    } catch (err) {
      this.logger.error(`Error saving/emitting chat message: ${err}`);
    }
  }

  @SubscribeMessage('editMessage')
  async handleEditMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { id: number; content: string },
  ) {
    const userId = client.data?.userId;
    const coupleId = client.data?.coupleId;

    if (!userId || !coupleId) {
      this.logger.warn(`editMessage rejected: socket client not authenticated.`);
      return;
    }

    if (!data?.id || !data.content || data.content.trim() === '') {
      return;
    }

    try {
      const updatedMessage = await this.chatService.editMessage(
        data.id,
        userId,
        data.content,
      );

      const roomName = `couple_${coupleId}`;
      this.server.to(roomName).emit('messageUpdated', updatedMessage);
    } catch (err) {
      this.logger.error(`Error editing/emitting chat message: ${err}`);
    }
  }

  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { id: number },
  ) {
    const userId = client.data?.userId;
    const coupleId = client.data?.coupleId;

    if (!userId || !coupleId) {
      this.logger.warn(`deleteMessage rejected: socket client not authenticated.`);
      return;
    }

    if (!data?.id) {
      return;
    }

    try {
      await this.chatService.deleteMessage(data.id, userId);

      const roomName = `couple_${coupleId}`;
      this.server.to(roomName).emit('messageDeleted', { id: data.id });
    } catch (err) {
      this.logger.error(`Error deleting/emitting chat message: ${err}`);
    }
  }
}
