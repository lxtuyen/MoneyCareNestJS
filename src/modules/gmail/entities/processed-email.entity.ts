import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum EmailProvider {
  VCB = 'VCB',
  MB = 'MB',
  TCB = 'TCB',
}

@Entity('processed_emails')
@Index(['gmailMessageId', 'provider'], { unique: true })
export class ProcessedEmail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  gmailMessageId: string;

  @Column()
  userId: number;

  @Column({
    type: 'enum',
    enum: EmailProvider,
  })
  provider: EmailProvider;

  @CreateDateColumn()
  processedAt: Date;
}
