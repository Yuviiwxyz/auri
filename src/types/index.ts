export type MessageType = 'text' | 'voice' | 'image' | 'file';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type ConnectionMode = 'direct-p2p' | 'ephemeral-relay' | 'connecting' | 'offline';

export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[]; // sender IDs who reacted
}

export interface QuotedReply {
  messageId: string;
  senderName: string;
  type: MessageType;
  snippet: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string; // 'me' or peerId
  senderName?: string;
  type: MessageType;
  content?: string; // Text content, caption, or note
  
  // Quoted reply reference
  replyTo?: QuotedReply;

  // Audio / Voice note specific fields
  mediaBlob?: Blob;
  mediaBase64?: string; // For network transport
  mediaMime?: string;
  mediaDuration?: number; // Duration in seconds
  mediaWaveform?: number[]; // Normalized amplitude peaks (0.05 - 1.0)
  
  // Image specific fields
  mediaDimensions?: { width: number; height: number };
  thumbnailBase64?: string;
  mediaSize?: number;

  // File / Document specific fields
  fileName?: string;
  fileSize?: number;
  fileExtension?: string;

  reactions?: Record<string, string[]>; // emoji -> array of senderIds
  status: MessageStatus;
  timestamp: number;
}

export interface Conversation {
  id: string;
  peerId: string;
  peerName: string;
  peerAvatar?: string;
  peerAvatarImage?: string;
  peerBio?: string;
  lastMessage?: {
    text: string;
    type: MessageType;
    timestamp: number;
  };
  unreadCount: number;
  updatedAt: number;
  connectionMode: ConnectionMode;
  isTyping?: boolean;
}

export interface UserProfile {
  peerId: string;
  displayName: string;
  avatarColor: string;
  avatarImage?: string; // Custom uploaded avatar photo (Base64 data URL)
  bio?: string; // Personal description / status
  relayUrl: string;
  soundEnabled: boolean;
  theme: 'dark' | 'light';
  hasCompletedOnboarding?: boolean;
}
