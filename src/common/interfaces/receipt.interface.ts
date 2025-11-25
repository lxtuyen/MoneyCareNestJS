export interface ReceiptScanResult {
  raw_text: string;

  merchant_name: string | null;
  address: string | null;

  date: string | null;
  total_amount: number | null;
  currency: string | null;

  category_key: string | null;
  category_name: string | null;

  confidence: number;
}
