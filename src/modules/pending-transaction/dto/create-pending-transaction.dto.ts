export interface CreatePendingTransactionInput {
  userId: number;
  gmailMessageId: string;
  provider: 'VCB';

  amount: number;
  currency: 'VND';
  transactionTime: Date;
  direction: 'IN' | 'OUT';

  senderName?: string;
  senderAccount?: string;
  receiverName?: string;
  receiverAccount?: string;
  description?: string;
  orderNumber?: string;
}
