export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessageBody {
  size: number;
  data?: string;
}

export interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename?: string;
  headers?: GmailMessageHeader[];
  body: GmailMessageBody;
  parts?: GmailMessagePart[];
}

export interface GmailMessageDetail {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  internalDate: string;
  payload: GmailMessagePart;
}
