import { OTP } from 'src/otp/entities/otp.entity';
import { SavingFund } from 'src/saving-funds/entities/saving-fund.entity';
import { Transaction } from 'src/transactions/entities/transaction.entity';
import { UserProfile } from 'src/user-profile/entities/user-profile.entity';
import { Notification } from 'src/notifications/entities/notification.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  OneToMany,
} from 'typeorm';

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

  @Column()
  password: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @OneToOne(() => UserProfile, (profile) => profile.user, {
    cascade: true,
    eager: true,
  })
  profile: UserProfile;

  @OneToMany(() => OTP, (otp) => otp.user)
  otps: OTP[];

  @OneToMany(() => SavingFund, (fund) => fund.user)
  savingFunds: SavingFund[];

  @OneToMany(() => Notification, (noti) => noti.user)
  notifications: Notification[];

  @OneToMany(() => Transaction, (trans) => trans.user)
  transactions: Transaction[];
}
