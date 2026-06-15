export class CoupleMemberResponseDto {
  userId!: number;
  email!: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  role!: 'owner' | 'partner';
  sharePersonalTransactions!: boolean;
  allowAiShare!: boolean;
  joinedAt!: Date;
}

export class CoupleResponseDto {
  id!: number;
  inviteCode!: string;
  status!: 'pending' | 'active' | 'cancelled' | 'left';
  createdAt!: Date;
  updatedAt!: Date;
  currentStreak!: number;
  lastActivityDate?: string | null;
  members!: CoupleMemberResponseDto[];
}
