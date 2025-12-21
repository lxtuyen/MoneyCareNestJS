export class PendingTransactionDto {
  id: string;
  amount: number;
  currency: string;
  direction: 'IN' | 'OUT';
  transactionTime: Date;
  description?: string;
  senderName?: string;
  receiverName?: string;
}
