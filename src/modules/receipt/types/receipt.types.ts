export interface ReceiptItem {
  name: string;
  amount: number;
  category: string;
  categoryId: number | null;
}

export interface ReceiptScanResult {
  merchant_name: string | null;
  date: string | null;
  total_amount: number | null;
  items: ReceiptItem[];
}
