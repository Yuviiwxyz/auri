import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Message, Conversation, UserProfile } from '../types';

interface LocalChatDB extends DBSchema {
  conversations: {
    key: string;
    value: Conversation;
    indexes: { 'by-updated': number };
  };
  messages: {
    key: string;
    value: Message;
    indexes: {
      'by-conversation': string;
      'by-timestamp': number;
    };
  };
  user_profile: {
    key: string;
    value: UserProfile;
  };
}

const DB_NAME = 'antigravity_local_chat_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<LocalChatDB>> | null = null;

export function getLocalDB(): Promise<IDBPDatabase<LocalChatDB>> {
  if (!dbPromise) {
    dbPromise = openDB<LocalChatDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Conversations store
        if (!db.objectStoreNames.contains('conversations')) {
          const convoStore = db.createObjectStore('conversations', { keyPath: 'id' });
          convoStore.createIndex('by-updated', 'updatedAt');
        }

        // Messages store
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('by-conversation', 'conversationId');
          msgStore.createIndex('by-timestamp', 'timestamp');
        }

        // User profile store
        if (!db.objectStoreNames.contains('user_profile')) {
          db.createObjectStore('user_profile', { keyPath: 'peerId' });
        }
      },
    });
  }
  return dbPromise;
}

// Generate random friendly peer ID, e.g. "WIN-8492" or "AND-3105"
export function generatePeerId(): string {
  const isAndroid = /Android/i.test(navigator.userAgent);
  const prefix = isAndroid ? 'AND' : 'WIN';
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${num}`;
}

const DEFAULT_AVATARS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
];

export function getDefaultRelayUrl(): string {
  if (typeof window !== 'undefined') {
    const savedCustom = localStorage.getItem('auri_custom_relay');
    if (savedCustom && savedCustom.trim()) return savedCustom.trim();

    const origin = window.location.origin;
    const isCapacitor = (window as any).Capacitor?.isNativePlatform?.() || origin.startsWith('capacitor:');
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // If running in live web browser on HTTPS (e.g. cloudflare tunnel, custom domain, or onrender)
    if (window.location.protocol === 'https:' && !isLocal && !isCapacitor) {
      return `wss://${window.location.host}/relay`;
    }

    // If running in browser on local machine
    if (isLocal && !isCapacitor) {
      return `ws://${window.location.hostname || 'localhost'}:3001`;
    }

    // If running in Android APK
    const savedDomain = localStorage.getItem('auri_custom_domain');
    if (savedDomain && savedDomain.trim()) {
      const host = savedDomain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      return `wss://${host}/relay`;
    }
  }
  return 'wss://auri-chat.onrender.com/relay';
}

// Profile storage
export async function getStoredProfile(): Promise<UserProfile> {
  // 1. Check localStorage first for instant, synchronous retrieval
  let cached: UserProfile | null = null;
  try {
    const raw = localStorage.getItem('auri_active_profile');
    if (raw) cached = JSON.parse(raw);
  } catch {}

  const db = await getLocalDB();
  const allProfiles = await db.getAll('user_profile');

  if (cached) {
    // If DB is out of sync or has old entries, sync it now
    if (allProfiles.length !== 1 || allProfiles[0].peerId !== cached.peerId) {
      const tx = db.transaction('user_profile', 'readwrite');
      await tx.objectStore('user_profile').clear();
      await tx.objectStore('user_profile').put(cached);
      await tx.done;
    }
    return cached;
  }

  if (allProfiles.length > 0) {
    // Return the latest profile and cache in localStorage
    const profile = allProfiles[allProfiles.length - 1];
    try {
      localStorage.setItem('auri_active_profile', JSON.stringify(profile));
      if (profile.hasCompletedOnboarding) {
        localStorage.setItem('auri_onboarding_completed', 'true');
      }
    } catch {}
    return profile;
  }

  // Create initial default profile
  const initialProfile: UserProfile = {
    peerId: generatePeerId(),
    displayName: /Android/i.test(navigator.userAgent) ? 'Android User' : 'Windows User',
    avatarColor: DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
    bio: 'Hey! I am using Auri Local-First ✨',
    relayUrl: getDefaultRelayUrl(),
    soundEnabled: true,
    theme: 'dark',
    hasCompletedOnboarding: false,
  };

  await saveProfile(initialProfile);
  return initialProfile;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  // 1. Save synchronously to localStorage
  try {
    localStorage.setItem('auri_active_profile', JSON.stringify(profile));
    if (profile.hasCompletedOnboarding) {
      localStorage.setItem('auri_onboarding_completed', 'true');
    }
  } catch {}

  // 2. Clear old profile records and write fresh profile to IndexedDB
  const db = await getLocalDB();
  const tx = db.transaction('user_profile', 'readwrite');
  await tx.objectStore('user_profile').clear();
  await tx.objectStore('user_profile').put(profile);
  await tx.done;
}

// Conversations storage
export async function getConversations(): Promise<Conversation[]> {
  const db = await getLocalDB();
  const convos = await db.getAllFromIndex('conversations', 'by-updated');
  return convos.reverse(); // Newest first
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const db = await getLocalDB();
  return db.get('conversations', id);
}

export async function saveConversation(convo: Conversation): Promise<void> {
  const db = await getLocalDB();
  await db.put('conversations', convo);
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getLocalDB();
  const tx = db.transaction(['conversations', 'messages'], 'readwrite');
  await tx.objectStore('conversations').delete(id);
  
  // Delete all messages in this conversation
  const msgIndex = tx.objectStore('messages').index('by-conversation');
  let cursor = await msgIndex.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

// Messages storage
export async function getMessages(conversationId: string): Promise<Message[]> {
  const db = await getLocalDB();
  const tx = db.transaction('messages', 'readonly');
  const index = tx.store.index('by-conversation');
  const msgs = await index.getAll(conversationId);
  return msgs.sort((a, b) => a.timestamp - b.timestamp);
}

export async function saveMessage(message: Message): Promise<void> {
  const db = await getLocalDB();
  await db.put('messages', message);

  // Update conversation's lastMessage and updatedAt
  const convo = await db.get('conversations', message.conversationId);
  if (convo) {
    convo.lastMessage = {
      text: message.type === 'text' 
        ? (message.content || '') 
        : message.type === 'voice' 
          ? '🎤 Voice note' 
          : message.type === 'image'
            ? '📷 Photo'
            : `📎 ${message.fileName || 'File'}`,
      type: message.type,
      timestamp: message.timestamp,
    };
    convo.updatedAt = message.timestamp;
    if (message.senderId !== 'me' && message.status !== 'read') {
      convo.unreadCount = (convo.unreadCount || 0) + 1;
    }
    await db.put('conversations', convo);
  }
}

export async function updateMessageStatus(
  messageId: string, 
  status: Message['status']
): Promise<void> {
  const db = await getLocalDB();
  const msg = await db.get('messages', messageId);
  if (msg) {
    msg.status = status;
    await db.put('messages', msg);
  }
}

export async function deleteMessage(messageId: string): Promise<void> {
  const db = await getLocalDB();
  const msg = await db.get('messages', messageId);
  if (!msg) return;

  const convoId = msg.conversationId;
  await db.delete('messages', messageId);

  // Update conversation's lastMessage if needed
  const convo = await db.get('conversations', convoId);
  if (convo) {
    const remainingMsgs = await getMessages(convoId);
    if (remainingMsgs.length > 0) {
      const last = remainingMsgs[remainingMsgs.length - 1];
      convo.lastMessage = {
        text: last.type === 'text' 
          ? (last.content || '') 
          : last.type === 'voice' 
            ? '🎤 Voice note' 
            : last.type === 'image'
              ? '📷 Photo'
              : `📎 ${last.fileName || 'File'}`,
        type: last.type,
        timestamp: last.timestamp,
      };
      convo.updatedAt = last.timestamp;
    } else {
      convo.lastMessage = undefined;
    }
    await db.put('conversations', convo);
  }
}

export async function addReactionToMessage(
  messageId: string, 
  emoji: string, 
  userId: string
): Promise<Message | null> {
  const db = await getLocalDB();
  const msg = await db.get('messages', messageId);
  if (!msg) return null;

  if (!msg.reactions) {
    msg.reactions = {};
  }

  const currentReactions = msg.reactions[emoji] || [];
  if (currentReactions.includes(userId)) {
    // Toggle off
    msg.reactions[emoji] = currentReactions.filter(id => id !== userId);
    if (msg.reactions[emoji].length === 0) {
      delete msg.reactions[emoji];
    }
  } else {
    // Add reaction
    msg.reactions[emoji] = [...currentReactions, userId];
  }

  await db.put('messages', msg);
  return msg;
}

// Full local database Export and Import (Zero-knowledge offline backup)
export async function exportLocalData(): Promise<string> {
  const db = await getLocalDB();
  const conversations = await db.getAll('conversations');
  const messages = await db.getAll('messages');
  const profile = await getStoredProfile();

  // Convert Blobs to Base64 for clean JSON serialization
  const serializableMessages = await Promise.all(
    messages.map(async (msg) => {
      if (msg.mediaBlob && !msg.mediaBase64) {
        const base64 = await blobToBase64(msg.mediaBlob);
        return { ...msg, mediaBase64: base64, mediaBlob: undefined };
      }
      return { ...msg, mediaBlob: undefined };
    })
  );

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile,
    conversations,
    messages: serializableMessages,
  };

  return JSON.stringify(backup, null, 2);
}

export async function importLocalData(jsonString: string): Promise<{ conversationsCount: number; messagesCount: number }> {
  const data = JSON.parse(jsonString);
  const db = await getLocalDB();

  const tx = db.transaction(['conversations', 'messages'], 'readwrite');
  let convCount = 0;
  let msgCount = 0;

  if (Array.isArray(data.conversations)) {
    for (const c of data.conversations) {
      await tx.objectStore('conversations').put(c);
      convCount++;
    }
  }

  if (Array.isArray(data.messages)) {
    for (const m of data.messages) {
      // Re-hydrate Blob if base64 exists
      if (m.mediaBase64 && m.mediaMime) {
        m.mediaBlob = base64ToBlob(m.mediaBase64, m.mediaMime);
      }
      await tx.objectStore('messages').put(m);
      msgCount++;
    }
  }

  await tx.done;
  return { conversationsCount: convCount, messagesCount: msgCount };
}

// Helpers for Blob <-> Base64
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.split(',')[1] || res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mime });
}
