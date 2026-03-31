export class ExpiredFundCheckDto {
  has_expired_fund: boolean;
  expired_fund?: {
    id: number;
    name: string;
    end_date: Date;
    completion_percentage: number;
    total_spent: number;
    target: number;
    budget: number;
  };
}
