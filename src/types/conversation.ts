export type MessageRole = "user" | "assistant";

export interface ConversationMessage {
  role: MessageRole;
  index: number;
  text: string;
  html?: string;
}

export interface Conversation {
  title?: string;
  url?: string;
  exportedAt: string;
  messages: ConversationMessage[];
}

export type CopyMode = "conversationLog" | "knowledgeNote" | "selectionCopy";

export interface ExtractResult {
  success: boolean;
  conversation?: Conversation;
  selectionHtml?: string;
  error?: string;
}

export interface CopyRequest {
  mode: CopyMode;
}

export interface CopyResponse {
  success: boolean;
  error?: string;
}
