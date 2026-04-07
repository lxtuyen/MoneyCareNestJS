import { CatOption } from '../../chatbot/types/chatbot.types';
import { ReceiptScanResult } from '../types/receipt.types';

export interface ReceiptProvider {
  scan(
    imageBuffer: Buffer,
    categories?: CatOption[],
  ): Promise<ReceiptScanResult>;
}
