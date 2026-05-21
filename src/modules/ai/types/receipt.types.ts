export interface ReceiptOcrLine {
  text: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface ReceiptRuleCandidate {
  merchantName?: string;
  transactionDate?: string;
  totalAmount?: number;
  currency?: string;
  confidence?: number;
  warnings?: string[];
}

export interface ScanReceiptModel {
  rawText: string;
  merchantName: string;
  address: string;
  date: string;
  totalAmount: number;
  currency: string;
  categoryKey: string;
  categoryName: string;
  suggestedNote?: string;
}

export interface ScanReceiptResponse {
  raw_text: string;
  merchant_name: string;
  address: string;
  date: string;
  total_amount: number;
  currency: string;
  category_key: string;
  category_name: string;
  suggested_note?: string;
}
