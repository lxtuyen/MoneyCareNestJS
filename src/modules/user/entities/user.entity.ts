import { OTP } from 'src/modules/otp/entities/otp.entity';
import { SavingFund } from 'src/modules/saving-funds/entities/saving-fund.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { UserProfile } from 'src/modules/user-profile/entities/user-profile.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { GmailToken } from 'src/modules/gmail/entities/gmail-token.entity';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({ default: false })
  isVip: boolean;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;

  @OneToOne(() => UserProfile, (profile) => profile.user, {
    cascade: true,
    eager: true,
  })
  profile: UserProfile;

  @OneToOne(() => GmailToken, (emailToken) => emailToken.user, {
    cascade: true,
    eager: true,
  })
  emailToken: GmailToken;

  @OneToMany(() => OTP, (otp) => otp.user)
  otps: OTP[];

  @OneToMany(() => SavingFund, (fund) => fund.user)
  savingFunds: SavingFund[];

  @OneToMany(() => Transaction, (trans) => trans.user)
  transactions: Transaction[];
}
