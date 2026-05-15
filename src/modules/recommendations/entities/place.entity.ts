import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlaceCheckin } from './place-checkin.entity';
import { PlaceAggregateStats } from './place-aggregate-stats.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Category } from 'src/modules/categories/entities/category.entity';

export enum PlaceSource {
  ADMIN_CREATED = 'ADMIN_CREATED',
  USER_CREATED = 'USER_CREATED',
}

export enum PlaceStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  HIDDEN = 'HIDDEN',
}

@Entity('places')
@Index(['provider', 'providerPlaceId'], { unique: true })
export class Place {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: 'goong' })
  provider: string;

  @Column({ type: 'varchar', nullable: true })
  providerPlaceId?: string | null;

  @Column()
  name: string;

  @Column()
  normalizedName: string;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  @Column({ type: 'double precision' })
  latitude: number;

  @Column({ type: 'double precision' })
  longitude: number;

  @Column({ type: 'simple-json', nullable: true })
  categories?: string[] | null;

  @Column({ type: 'enum', enum: PlaceSource, default: PlaceSource.USER_CREATED })
  source: PlaceSource;

  @Column({ type: 'enum', enum: PlaceStatus, default: PlaceStatus.ACTIVE })
  status: PlaceStatus;

  @Column({ default: false })
  isSystemSuggested: boolean;

  @Column({ type: 'text', nullable: true })
  hiddenReason?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy?: User | null;

  @ManyToOne(() => Category, { nullable: true, onDelete: 'SET NULL' })
  category?: Category | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date | null;

  @OneToMany(() => PlaceCheckin, (checkin) => checkin.place)
  checkins: PlaceCheckin[];

  @OneToOne(() => PlaceAggregateStats, (stats) => stats.place)
  aggregateStats?: PlaceAggregateStats;
}
