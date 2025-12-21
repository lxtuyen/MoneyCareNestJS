export interface GmailMessageItem {
  id: string;
  threadId: string;
}

export interface GmailListMessagesResponse {
  messages?: GmailMessageItem[];
  nextPageToken?: string;
  resultSizeEstimate: number;
}
