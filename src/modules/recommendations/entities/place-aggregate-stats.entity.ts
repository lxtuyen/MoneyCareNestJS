import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Place } from './place.entity';

@Entity('place_aggregate_stats')
export class PlaceAggregateStats {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => Place, (place) => place.aggregateStats, {
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  place: Place;

  @Column({ default: 0 })
  checkinCount: number;

  @Column({ type: 'double precision', default: 0 })
  avgRating: number;

  @Column({ type: 'double precision', default: 0 })
  avgAmount: number;

  @Column({ type: 'double precision', default: 0 })
  minAmount: number;

  @Column({ type: 'double precision', default: 0 })
  maxAmount: number;

  @Column({ type: 'double precision', default: 0 })
  returnIntentRate: number;

  @Column({ type: 'simple-json', nullable: true })
  popularTags?: string[] | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
