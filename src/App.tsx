import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Conversation, Message, MessageType, UserProfile, QuotedReply } from './types';
import {
  getStoredProfile,
  saveProfile,
  getConversations,
  getConversation,
  saveConversation,
  deleteConversation as deleteStorageConvo,
  getMessages,
  saveMessage,
  deleteMessage as deleteStorageMessage,
  updateMessageStatus,
  addReactionToMessage,
  getLocalDB,
} from './services/storage';
import { network } from './services/network';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { DevicePairingModal } from './components/DevicePairingModal';
import { SettingsModal } from './components/SettingsModal';
import { OnboardingModal } from './components/OnboardingModal';
import { notifications } from './services/notifications';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

export function getCanonicalConvoId(id1: string, id2: string): string {
  const a = (id1 || '').trim().toLowerCase();
  const b = (id2 || '').trim().toLowerCase();
  return `convo_${[a, b].sort().join('_')}`;
}

export const App: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<Message[]>([]);
  const [isServerConnected, setIsServerConnected] = useState<boolean>(false);
  const [isPairingModalOpen, setIsPairingModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState<boolean>(false);
  const [totalMessageCount, setTotalMessageCount] = useState<number>(0);
  const [inAppToast, setInAppToast] = useState<{
    senderName: string;
    content: string;
    conversationId: string;
  } | null>(null);
  const [androidPromptUser, setAndroidPromptUser] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeConvoRef = useRef<string | null>(null);
  activeConvoRef.current = activeConversationId;
  const profileRef = useRef<UserProfile | null>(null);
  profileRef.current = profile;
  const conversationsRef = useRef<Conversation[]>(conversations);
  conversationsRef.current = conversations;
  const isPairingModalOpenRef = useRef<boolean>(false);
  isPairingModalOpenRef.current = isPairingModalOpen;
  const isSettingsModalOpenRef = useRef<boolean>(false);
  isSettingsModalOpenRef.current = isSettingsModalOpen;

  // Handle Android / mobile browser hardware & gesture back button
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state;
      if (!state) {
        if (isPairingModalOpenRef.current) setIsPairingModalOpen(false);
        if (isSettingsModalOpenRef.current) setIsSettingsModalOpen(false);
        if (activeConvoRef.current) setActiveConversationId(null);
        return;
      }

      if (state.view === 'chat' && state.id) {
        setActiveConversationId(state.id);
        setIsPairingModalOpen(false);
        setIsSettingsModalOpen(false);
      } else if (state.view === 'pairing') {
        setIsPairingModalOpen(true);
        setIsSettingsModalOpen(false);
      } else if (state.view === 'settings') {
        setIsSettingsModalOpen(true);
        setIsPairingModalOpen(false);
      } else {
        setActiveConversationId(null);
        setIsPairingModalOpen(false);
        setIsSettingsModalOpen(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 1. Initial Load from Local IndexedDB
  useEffect(() => {
    async function loadInitialData() {
      const loadedProfile = await getStoredProfile();
      setProfile(loadedProfile);

      // Check if this device has completed initial profile setup (username, pfp, display name, bio)
      const hasCompleted = loadedProfile.hasCompletedOnboarding || localStorage.getItem('auri_onboarding_completed') === 'true';
      if (!hasCompleted) {
        setIsOnboardingModalOpen(true);
      }

      let convos = await getConversations();
      setConversations(convos);

      if (convos.length > 0 && window.innerWidth >= 768) {
        setActiveConversationId(convos[0].id);
      }

      // Count total local messages
      const db = await getLocalDB();
      const count = await db.count('messages');
      setTotalMessageCount(count);

      // Initialize network relay connection and profile
      network.setMyProfile(loadedProfile);
      network.init(loadedProfile.peerId, loadedProfile.relayUrl);

      // Handle account invite links from URL query parameters: ?user=<username> or ?connect=<username>
      const params = new URLSearchParams(window.location.search);
      const targetUser = params.get('user') || params.get('connect');
      if (targetUser) {
        const cleanUser = targetUser.trim().replace(/^@/, '');
        if (cleanUser && cleanUser.toLowerCase() !== loadedProfile.peerId.toLowerCase()) {
          const canonicalConvoId = getCanonicalConvoId(loadedProfile.peerId, cleanUser);
          let targetConvo = convos.find(
            (c) => c.peerId.trim().toLowerCase() === cleanUser.toLowerCase() || c.id.toLowerCase() === canonicalConvoId.toLowerCase()
          );
          if (!targetConvo) {
            targetConvo = {
              id: canonicalConvoId,
              peerId: cleanUser,
              peerName: cleanUser,
              peerAvatar: '#0ea5e9',
              unreadCount: 0,
              updatedAt: Date.now(),
              connectionMode: 'connecting',
            };
            await saveConversation(targetConvo);
            convos = [targetConvo, ...convos];
            setConversations(convos);
          }
          setActiveConversationId(targetConvo.id);
          network.initiateWebRTC(cleanUser).catch(console.warn);
          network.sendProfileUpdateToPeer(cleanUser);
          network.sendConnectHandshake(cleanUser);

          // If viewing on mobile browser, prompt and attempt 1-tap launch of installed Auri APK
          if (!Capacitor.isNativePlatform() && /Android/i.test(navigator.userAgent)) {
            setAndroidPromptUser(cleanUser);
            try {
              const intentUri = `intent://chat?user=${encodeURIComponent(cleanUser)}#Intent;scheme=auri;package=com.auri.chat;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
              window.location.href = intentUri;
            } catch {}
          }

          // Clean URL params so refresh keeps current state clean
          const cleanPath = window.location.pathname;
          window.history.replaceState({ view: 'chat', id: targetConvo.id }, '', cleanPath);
        }
      }

      // Proactively request notification permissions (especially for Android APK)
      notifications.requestPermission().catch(() => {});
    }

    loadInitialData();

    return () => {
      network.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleFocus = () => notifications.clearTitleBadge();
    window.addEventListener('focus', handleFocus);

    // Deep link / navigation callback from native or ServiceWorker notification click
    notifications.onNotificationNavigate((conversationId) => {
      handleSelectConversation(conversationId);
    });

    // Touch gesture unlock for Web Audio chime (needed on Android Chrome)
    const unlockAudio = () => {
      notifications.playChime();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Deep Link listener for Native Android APK (Capacitor)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const listenerPromise = CapApp.addListener('appUrlOpen', (data) => {
        try {
          let target: string | null = null;
          try {
            const urlObj = new URL(data.url);
            target = urlObj.searchParams.get('user') || urlObj.searchParams.get('connect') || urlObj.searchParams.get('id');
          } catch {
            const match = data.url.match(/[?&](?:user|connect|id)=([^&]+)/);
            if (match && match[1]) {
              target = decodeURIComponent(match[1]);
            }
          }

          if (target && profileRef.current) {
            const cleanUser = target.trim().replace(/^@/, '');
            if (cleanUser && cleanUser.toLowerCase() !== profileRef.current.peerId.toLowerCase()) {
              const canonicalId = getCanonicalConvoId(profileRef.current.peerId, cleanUser);
              let found = conversationsRef.current.find(
                (c) => c.peerId.toLowerCase() === cleanUser.toLowerCase() || c.id.toLowerCase() === canonicalId.toLowerCase()
              );
              if (!found) {
                const newConvo: Conversation = {
                  id: canonicalId,
                  peerId: cleanUser,
                  peerName: cleanUser,
                  peerAvatar: '#0ea5e9',
                  unreadCount: 0,
                  updatedAt: Date.now(),
                  connectionMode: 'connecting',
                };
                saveConversation(newConvo).catch(console.error);
                setConversations((prev) => [newConvo, ...prev.filter((c) => c.id !== newConvo.id)]);
                found = newConvo;
              }
              setActiveConversationId(found.id);
              network.initiateWebRTC(cleanUser).catch(console.warn);
              network.sendProfileUpdateToPeer(cleanUser);
              network.sendConnectHandshake(cleanUser);
            }
          }
        } catch (e) {
          console.warn('Error handling deep link:', e);
        }
      });

      return () => {
        listenerPromise.then((handle) => handle.remove()).catch(() => {});
      };
    }
  }, []);

  // 2. Load Messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId) {
      setActiveMessages([]);
      return;
    }

    async function loadActiveMessages() {
      const msgs = await getMessages(activeConversationId!);
      setActiveMessages(msgs);

      // Clear unread count for active conversation
      const convo = await getConversation(activeConversationId!);
      if (convo && convo.unreadCount > 0) {
        convo.unreadCount = 0;
        await saveConversation(convo);
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConversationId ? { ...c, unreadCount: 0 } : c))
        );
      }

      // Automatically attempt direct P2P connection
      if (convo) {
        network.initiateWebRTC(convo.peerId).catch(() => {
          // Normal fallback to relay
        });
      }
    }

    loadActiveMessages();
  }, [activeConversationId]);

  // 3. Setup Network Event Handlers
  useEffect(() => {
    const unsubMsg = network.onMessageReceived(async (incomingMsg, senderPeerId) => {
      const myId = profileRef.current?.peerId || '';
      const normSender = (senderPeerId || '').trim().toLowerCase();
      const canonicalConvoId = myId ? getCanonicalConvoId(myId, senderPeerId) : incomingMsg.conversationId;

      // Check if conversation already exists by peerId (case-insensitive) OR by canonicalConvoId
      const currentConvos = conversationsRef.current;
      let convo = currentConvos.find((c) => c.peerId.trim().toLowerCase() === normSender)
               || currentConvos.find((c) => c.id.toLowerCase() === canonicalConvoId.toLowerCase())
               || await getConversation(canonicalConvoId)
               || await getConversation(incomingMsg.conversationId);

      if (!convo) {
        const cleanSender = (senderPeerId || '').trim().replace(/^@/, '');
        const defaultName = cleanSender.toUpperCase().startsWith('AND')
          ? 'Android Phone'
          : cleanSender.toUpperCase().startsWith('WIN')
            ? 'Windows PC'
            : cleanSender;

        const newConvo: Conversation = {
          id: canonicalConvoId,
          peerId: cleanSender,
          peerName: defaultName,
          unreadCount: 0,
          updatedAt: incomingMsg.timestamp,
          connectionMode: 'ephemeral-relay',
        };
        await saveConversation(newConvo);
        conversationsRef.current = [newConvo, ...conversationsRef.current.filter((c) => c.id !== newConvo.id)];
        setConversations(conversationsRef.current);
        convo = newConvo;
      }

      // Ensure message conversationId matches local conversation
      incomingMsg.conversationId = convo.id;

      // Save to device local IndexedDB
      await saveMessage(incomingMsg);

      // Check if user is currently viewing this conversation
      const currentActiveId = activeConvoRef.current;
      const activeChat = currentConvos.find((c) => c.id === currentActiveId);
      const isViewingThisChat = (currentActiveId === convo.id)
        || (activeChat && activeChat.peerId.trim().toLowerCase() === normSender);

      if (isViewingThisChat) {
        setActiveMessages((prev) => {
          if (prev.some((m) => m.id === incomingMsg.id)) return prev;
          return [...prev, incomingMsg];
        });
        network.sendReadAck(senderPeerId, incomingMsg.id);
        await updateMessageStatus(incomingMsg.id, 'read');
      }

      // Refresh conversations list
      const updatedConvos = await getConversations();
      setConversations(updatedConvos);
      setTotalMessageCount((prev) => prev + 1);

      // Notification audio chime & phone tactile vibration
      notifications.playChime();

      // Native Desktop / Android System Notification & Title Badge
      notifications.showMessageNotification({
        senderName: convo.peerName,
        messageType: incomingMsg.type,
        content: incomingMsg.content,
        conversationId: convo.id,
        isViewingThisChat,
        onNotificationClick: () => {
          handleSelectConversation(convo.id);
        },
      });

      // In-app floating drop-down banner if not currently viewing this conversation
      if (!isViewingThisChat) {
        let snippet = incomingMsg.content;
        if (incomingMsg.type === 'image') snippet = '📷 Photo';
        else if (incomingMsg.type === 'voice') snippet = '🎤 Voice message';
        else if (incomingMsg.type === 'file') snippet = '📎 Shared file';
        else if (snippet && snippet.length > 60) snippet = snippet.substring(0, 60) + '...';

        setInAppToast({
          senderName: convo.peerName,
          content: snippet || 'New message',
          conversationId: convo.id,
        });

        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => {
          setInAppToast(null);
        }, 4000);
      }
    });

    const unsubStatus = network.onStatusUpdate((messageId, status) => {
      updateMessageStatus(messageId, status);
      setActiveMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status } : m))
      );
    });

    const unsubMode = network.onConnectionMode((peerId, mode) => {
      setConversations((prev) =>
        prev.map((c) => (c.peerId === peerId ? { ...c, connectionMode: mode } : c))
      );
    });

    const unsubTyping = network.onTyping((senderPeerId, isTyping) => {
      setConversations((prev) =>
        prev.map((c) => (c.peerId === senderPeerId ? { ...c, isTyping } : c))
      );
    });

    const unsubProfile = network.onPeerProfileUpdate(async (peerId, updatedProfile) => {
      const myId = profileRef.current?.peerId || '';
      if (!myId || peerId.trim().toLowerCase() === myId.trim().toLowerCase()) return;
      const normSender = peerId.trim().toLowerCase();
      const canonicalConvoId = getCanonicalConvoId(myId, peerId);

      const currentConvos = conversationsRef.current;
      let convo = currentConvos.find((c) => c.peerId.trim().toLowerCase() === normSender)
               || currentConvos.find((c) => c.id.toLowerCase() === canonicalConvoId.toLowerCase())
               || await getConversation(canonicalConvoId);

      if (convo) {
        const toSave: Conversation = {
          ...convo,
          peerName: updatedProfile.displayName || convo.peerName,
          peerAvatar: updatedProfile.avatarColor || convo.peerAvatar,
          peerAvatarImage: updatedProfile.avatarImage !== undefined ? updatedProfile.avatarImage : convo.peerAvatarImage,
          peerBio: updatedProfile.bio !== undefined ? updatedProfile.bio : convo.peerBio,
        };
        await saveConversation(toSave);
        conversationsRef.current = conversationsRef.current.map((c) => (c.id === convo.id ? toSave : c));
        setConversations(conversationsRef.current);
      } else {
        const cleanSender = peerId.trim().replace(/^@/, '');
        const defaultName = cleanSender.toUpperCase().startsWith('AND')
          ? 'Android Phone'
          : cleanSender.toUpperCase().startsWith('WIN')
            ? 'Windows PC'
            : cleanSender;

        const newConvo: Conversation = {
          id: canonicalConvoId,
          peerId: cleanSender,
          peerName: updatedProfile.displayName || defaultName,
          peerAvatar: updatedProfile.avatarColor || '#0ea5e9',
          peerAvatarImage: updatedProfile.avatarImage,
          peerBio: updatedProfile.bio,
          unreadCount: 0,
          updatedAt: Date.now(),
          connectionMode: 'ephemeral-relay',
        };
        await saveConversation(newConvo);
        conversationsRef.current = [newConvo, ...conversationsRef.current.filter((c) => c.id !== newConvo.id)];
        setConversations(conversationsRef.current);
      }
    });

    const unsubHandshake = network.onConnectHandshake(async (senderPeerId, senderProfile) => {
      if (!senderPeerId) return;
      const myId = profileRef.current?.peerId || '';
      if (!myId || senderPeerId.trim().toLowerCase() === myId.trim().toLowerCase()) return;

      const normSender = senderPeerId.trim().toLowerCase();
      const canonicalConvoId = getCanonicalConvoId(myId, senderPeerId);

      const currentConvos = conversationsRef.current;
      let convo = currentConvos.find((c) => c.peerId.trim().toLowerCase() === normSender)
               || currentConvos.find((c) => c.id.toLowerCase() === canonicalConvoId.toLowerCase())
               || await getConversation(canonicalConvoId);

      if (!convo) {
        const cleanSender = senderPeerId.trim().replace(/^@/, '');
        const defaultName = cleanSender.toUpperCase().startsWith('AND')
          ? 'Android Phone'
          : cleanSender.toUpperCase().startsWith('WIN')
            ? 'Windows PC'
            : cleanSender;

        const newConvo: Conversation = {
          id: canonicalConvoId,
          peerId: cleanSender,
          peerName: senderProfile?.displayName || defaultName,
          peerAvatar: senderProfile?.avatarColor || '#0ea5e9',
          peerAvatarImage: senderProfile?.avatarImage,
          peerBio: senderProfile?.bio,
          unreadCount: 0,
          updatedAt: Date.now(),
          connectionMode: 'ephemeral-relay',
        };
        await saveConversation(newConvo);
        conversationsRef.current = [newConvo, ...conversationsRef.current.filter((c) => c.id !== newConvo.id)];
        setConversations(conversationsRef.current);

        // Alert user that a peer has connected via link!
        notifications.playChime();
        setInAppToast({
          senderName: newConvo.peerName,
          content: 'Connected via invite link!',
          conversationId: newConvo.id,
        });
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setInAppToast(null), 4000);
      } else {
        if (senderProfile) {
          const updated: Conversation = {
            ...convo,
            peerName: senderProfile.displayName || convo.peerName,
            peerAvatar: senderProfile.avatarColor || convo.peerAvatar,
            peerAvatarImage: senderProfile.avatarImage !== undefined ? senderProfile.avatarImage : convo.peerAvatarImage,
            peerBio: senderProfile.bio !== undefined ? senderProfile.bio : convo.peerBio,
          };
          await saveConversation(updated);
          conversationsRef.current = conversationsRef.current.map((c) => (c.id === convo.id ? updated : c));
          setConversations(conversationsRef.current);
        }
      }

      // Automatically initiate WebRTC and respond with our profile
      network.initiateWebRTC(senderPeerId).catch(() => {});
      network.sendProfileUpdateToPeer(senderPeerId);
    });

    const unsubServer = network.onServerStatus((connected) => {
      setIsServerConnected(connected);
    });

    const unsubReaction = network.onReaction(async (messageId, emoji, senderPeerId) => {
      const updated = await addReactionToMessage(messageId, emoji, senderPeerId);
      if (updated) {
        setActiveMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions: updated.reactions } : m))
        );
      }
    });

    const unsubDeleted = network.onMessageDeleted(async (messageId) => {
      await deleteStorageMessage(messageId);
      setActiveMessages((prev) => prev.filter((m) => m.id !== messageId));
      const updatedConvos = await getConversations();
      setConversations(updatedConvos);
      setTotalMessageCount((prev) => Math.max(0, prev - 1));
    });

    return () => {
      unsubMsg();
      unsubStatus();
      unsubMode();
      unsubTyping();
      unsubProfile();
      unsubHandshake();
      unsubServer();
      unsubReaction();
      unsubDeleted();
    };
  }, []);

  // 4. Send Message Handler
  const handleSendMessage = useCallback(
    async (
      type: MessageType,
      content?: string,
      media?: {
        blob?: Blob;
        duration?: number;
        waveform?: number[];
        dimensions?: { width: number; height: number };
        thumbnailBase64?: string;
        mime?: string;
        fileName?: string;
        fileSize?: number;
        fileExtension?: string;
      },
      replyTo?: QuotedReply
    ) => {
      if (!activeConversationId || !profile) return;
      const convo = conversations.find((c) => c.id === activeConversationId);
      if (!convo) return;

      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const newMessage: Message = {
        id: messageId,
        conversationId: activeConversationId,
        senderId: 'me',
        senderName: profile.displayName,
        type,
        content,
        replyTo,
        mediaBlob: media?.blob,
        mediaDuration: media?.duration,
        mediaWaveform: media?.waveform,
        mediaDimensions: media?.dimensions,
        thumbnailBase64: media?.thumbnailBase64,
        mediaMime: media?.mime,
        fileName: media?.fileName,
        fileSize: media?.fileSize,
        fileExtension: media?.fileExtension,
        status: 'sending',
        timestamp: Date.now(),
      };

      // 1. Immediately store in local IndexedDB
      await saveMessage(newMessage);
      setActiveMessages((prev) => [...prev, newMessage]);
      setTotalMessageCount((prev) => prev + 1);

      // Refresh sidebar list
      const updatedConvos = await getConversations();
      setConversations(updatedConvos);

      // 2. Transmit over WebRTC P2P or Ephemeral Relay
      try {
        const modeUsed = await network.sendMessage(convo.peerId, newMessage);
        await updateMessageStatus(messageId, 'sent');
        setActiveMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, status: 'sent' } : m))
        );

        // Update connection mode display
        setConversations((prev) =>
          prev.map((c) => (c.id === convo.id ? { ...c, connectionMode: modeUsed } : c))
        );
      } catch (err) {
        console.error('Send message error:', err);
      }
    },
    [activeConversationId, conversations, profile]
  );

  // Delete a single message from local IndexedDB and notify other device
  const handleDeleteMessage = useCallback(async (messageId: string) => {
    // Notify peer device so the message is deleted there as well!
    const convo = conversationsRef.current.find((c) => c.id === activeConvoRef.current);
    if (convo && convo.peerId) {
      network.deleteMessage(convo.peerId, messageId);
    }

    await deleteStorageMessage(messageId);
    setActiveMessages((prev) => prev.filter((m) => m.id !== messageId));
    const updatedConvos = await getConversations();
    setConversations(updatedConvos);
    setTotalMessageCount((prev) => Math.max(0, prev - 1));
  }, []);

  // Navigation helpers for mobile Android back gesture & hardware button
  const handleSelectConversation = (id: string | null) => {
    if (id) {
      window.history.pushState({ view: 'chat', id }, '');
    }
    setActiveConversationId(id);
  };

  const handleBackFromChat = () => {
    if (window.history.state?.view === 'chat') {
      window.history.back();
    } else {
      setActiveConversationId(null);
    }
  };

  const handleOpenPairing = () => {
    window.history.pushState({ view: 'pairing' }, '');
    setIsPairingModalOpen(true);
  };

  const handleClosePairing = () => {
    if (window.history.state?.view === 'pairing') {
      window.history.back();
    } else {
      setIsPairingModalOpen(false);
    }
  };

  const handleOpenSettings = () => {
    window.history.pushState({ view: 'settings' }, '');
    setIsSettingsModalOpen(true);
  };

  const handleCloseSettings = () => {
    if (window.history.state?.view === 'settings') {
      window.history.back();
    } else {
      setIsSettingsModalOpen(false);
    }
  };

  // 5. Connect to New Peer from Pairing Modal
  const handleConnectPeer = async (peerId: string, peerName: string) => {
    if (!profile) return;
    const cleanId = peerId.trim().replace(/^@/, '');
    if (!cleanId) return;

    setIsPairingModalOpen(false);
    const canonicalConvoId = getCanonicalConvoId(profile.peerId, cleanId);
    let existing = conversations.find(
      (c) => c.peerId.trim().toLowerCase() === cleanId.toLowerCase() || c.id.toLowerCase() === canonicalConvoId.toLowerCase()
    );
    if (!existing) {
      const newConvo: Conversation = {
        id: canonicalConvoId,
        peerId: cleanId,
        peerName: peerName.trim() || cleanId,
        peerAvatar: ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#06b6d4'][
          Math.floor(Math.random() * 5)
        ],
        unreadCount: 0,
        updatedAt: Date.now(),
        connectionMode: 'connecting',
      };

      await saveConversation(newConvo);
      setConversations((prev) => [newConvo, ...prev]);
      handleSelectConversation(canonicalConvoId);
      network.initiateWebRTC(cleanId).catch(console.warn);
      network.sendProfileUpdateToPeer(cleanId);
      network.sendConnectHandshake(cleanId);
    } else {
      handleSelectConversation(existing.id);
      network.initiateWebRTC(existing.peerId).catch(console.warn);
      network.sendProfileUpdateToPeer(existing.peerId);
      network.sendConnectHandshake(existing.peerId);
    }
  };

  // 6. Message Reactions
  const handleToggleReaction = async (messageId: string, emoji: string) => {
    const updated = await addReactionToMessage(messageId, emoji, 'me');
    if (updated) {
      setActiveMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: updated.reactions } : m))
      );
    }

    // Broadcast reaction to active conversation peer across network
    if (activeConversationId) {
      const convo = conversationsRef.current.find((c) => c.id === activeConversationId);
      if (convo) {
        network.sendReaction(convo.peerId, messageId, emoji);
      }
    }
  };

  // 7. Typing Indicator
  const handleSendTyping = (isTyping: boolean) => {
    if (!activeConversationId) return;
    const convo = conversations.find((c) => c.id === activeConversationId);
    if (convo) {
      network.sendTyping(convo.peerId, isTyping);
    }
  };

  // 8. Delete Conversation
  const handleDeleteConversation = async (id: string) => {
    await deleteStorageConvo(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      handleBackFromChat();
    }
  };

  // 9. Wipe All Local Data
  const handleClearAllData = async () => {
    const db = await getLocalDB();
    await db.clear('conversations');
    await db.clear('messages');
    setConversations([]);
    setActiveMessages([]);
    setActiveConversationId(null);
    setTotalMessageCount(0);
  };

  // 10. Update Profile Settings
  const handleSaveProfile = async (newProfile: UserProfile) => {
    const oldPeerId = profile?.peerId;
    setProfile(newProfile);
    await saveProfile(newProfile);
    network.setMyProfile(newProfile);

    if (newProfile.peerId !== oldPeerId) {
      network.updatePeerId(newProfile.peerId);
    }
    network.updateRelayUrl(newProfile.relayUrl);

    // Broadcast our updated profile to all conversation peers
    const peerIds = conversationsRef.current.map((c) => c.peerId);
    network.broadcastProfileUpdate(newProfile, peerIds);
  };

  const handleSaveOnboarding = async (newProfile: UserProfile) => {
    const oldPeerId = profile?.peerId;
    const completedProfile = { ...newProfile, hasCompletedOnboarding: true };
    setProfile(completedProfile);
    await saveProfile(completedProfile);
    localStorage.setItem('auri_onboarding_completed', 'true');
    setIsOnboardingModalOpen(false);

    network.setMyProfile(completedProfile);
    if (completedProfile.peerId !== oldPeerId) {
      network.updatePeerId(completedProfile.peerId);
    }
    network.updateRelayUrl(completedProfile.relayUrl);

    // Broadcast our updated profile to all conversation peers
    const peerIds = conversationsRef.current.map((c) => c.peerId);
    if (peerIds.length > 0) {
      network.broadcastProfileUpdate(completedProfile, peerIds);
    }
  };

  const activeConvo = conversations.find((c) => c.id === activeConversationId);

  return (
    <div className="app-shell">
      {/* Smart App Banner for Mobile Web Viewers */}
      {!Capacitor.isNativePlatform() && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.95), rgba(2, 132, 199, 0.95))',
          color: '#ffffff',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
          boxShadow: '0 2px 8px rgba(14, 165, 233, 0.25)',
          zIndex: 9999,
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="./logo.png" alt="Auri" style={{ width: '28px', height: '28px', borderRadius: '7px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }} />
            <div>
              <div style={{ fontWeight: '700', fontSize: '12px', lineHeight: '1.2' }}>Auri Messenger</div>
              <div style={{ fontSize: '10px', opacity: 0.9 }}>Have the APK installed?</div>
            </div>
          </div>
          <a
            href={`auri://chat${window.location.search || ''}`}
            style={{
              background: '#ffffff',
              color: '#0284c7',
              fontWeight: '700',
              fontSize: '11px',
              padding: '5px 12px',
              borderRadius: '16px',
              textDecoration: 'none',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15)'
            }}
          >
            Open in App
          </a>
        </div>
      )}

      {/* Ambient Frutiger Aero Atmosphere: Aqua Sheen, Pinstripes & Floating Bubbles */}
      <div className="aero-bubbles-container" aria-hidden="true">
        <div className="aero-pinstripes" />
        <div className="aero-light-sweep" />
        <div className="aero-bubble b1 aero-blue" />
        <div className="aero-bubble b2 aero-pink" />
        <div className="aero-bubble b3 aero-mint" />
        <div className="aero-bubble b4 aero-amber" />
        <div className="aero-bubble b5 aero-blue pulse-bubble" />
        <div className="aero-bubble b6 aero-pink" />
        <div className="aero-bubble b7 aero-mint" />
        <div className="aero-bubble b8 aero-amber pulse-bubble" />
        <div className="aero-bubble b9 aero-blue" />
        <div className="aero-bubble b10 aero-pink" />
      </div>

      {/* Floating In-App Dropdown Toast Banner */}
      {inAppToast && (
        <div
          className="in-app-toast-banner"
          onClick={() => {
            handleSelectConversation(inAppToast.conversationId);
            setInAppToast(null);
          }}
          role="alert"
        >
          <div className="in-app-toast-icon">💬</div>
          <div className="in-app-toast-body">
            <div className="in-app-toast-sender">{inAppToast.senderName}</div>
            <div className="in-app-toast-snippet">{inAppToast.content}</div>
          </div>
          <button
            type="button"
            className="in-app-toast-close"
            onClick={(e) => {
              e.stopPropagation();
              setInAppToast(null);
            }}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      )}

      {/* Sidebar: Conversation List */}
      <div className={`sidebar-pane ${activeConversationId ? 'hide-on-mobile' : ''}`}>
        {profile && (
          <Sidebar
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={handleSelectConversation}
            onOpenPairing={handleOpenPairing}
            onOpenSettings={handleOpenSettings}
            onDeleteConversation={handleDeleteConversation}
            profile={profile}
            isServerConnected={isServerConnected}
          />
        )}
      </div>

      {/* Main Chat Area */}
      <div className={`chat-pane ${!activeConversationId ? 'hide-on-mobile' : ''}`}>
        {activeConvo ? (
          <ChatArea
            conversation={activeConvo}
            messages={activeMessages}
            onSendMessage={handleSendMessage}
            onDeleteMessage={handleDeleteMessage}
            onBack={handleBackFromChat}
            onToggleReaction={handleToggleReaction}
            onSendTyping={handleSendTyping}
            onInitiateP2P={(peerId) => network.initiateWebRTC(peerId)}
          />
        ) : (
          <div className="no-chat-selected">
            <div className="welcome-card">
              <div className="welcome-app-icon">
                <img src="/logo.png" alt="Auri Logo" className="welcome-logo-img" />
              </div>
              <h2>Auri Local-First</h2>
              <p>
                Private cross-platform chat running seamlessly on <strong>Android</strong> and <strong>Windows</strong> across any distance.
              </p>
              <div className="welcome-features-list">
                <div className="feature-item">
                  <span className="feature-bullet">🔒</span>
                  <span>100% On-Device Local Storage (Zero Cloud DB)</span>
                </div>
                <div className="feature-item">
                  <span className="feature-bullet">🎤</span>
                  <span>Voice notes with live scrubbing waveforms</span>
                </div>
                <div className="feature-item">
                  <span className="feature-bullet">📷</span>
                  <span>Camera snapshot, gallery photos & full-screen lightbox</span>
                </div>
                <div className="feature-item">
                  <span className="feature-bullet">📎</span>
                  <span>Share files, documents, and clickable URL links</span>
                </div>
                <div className="feature-item">
                  <span className="feature-bullet">⚡</span>
                  <span>WebRTC P2P direct + Zero-Retention Relay</span>
                </div>
              </div>

              <button
                type="button"
                className="welcome-pair-btn"
                onClick={handleOpenPairing}
              >
                <span>Pair Android or Windows Device</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Device Pairing Modal */}
      {profile && (
        <DevicePairingModal
          isOpen={isPairingModalOpen}
          myPeerId={profile.peerId}
          onClose={handleClosePairing}
          onConnectPeer={handleConnectPeer}
          existingConversations={conversations}
        />
      )}

      {/* Settings Modal */}
      {profile && (
        <SettingsModal
          isOpen={isSettingsModalOpen}
          profile={profile}
          onClose={handleCloseSettings}
          onSaveProfile={handleSaveProfile}
          onClearAllData={handleClearAllData}
          messageCount={totalMessageCount}
          convoCount={conversations.length}
        />
      )}

      {/* First-Time Device Onboarding Modal */}
      {profile && (
        <OnboardingModal
          isOpen={isOnboardingModalOpen}
          initialProfile={profile}
          onComplete={handleSaveOnboarding}
        />
      )}

      {/* Floating 1-Tap Android App Launch Banner for Mobile Chrome */}
      {androidPromptUser && !Capacitor.isNativePlatform() && (
        <div className="android-intent-banner">
          <div className="android-intent-content">
            <div className="android-intent-icon">✨</div>
            <div className="android-intent-text">
              <strong>Chat with @{androidPromptUser} in Auri App</strong>
              <span>Tap to switch directly to your installed Auri application</span>
            </div>
          </div>
          <div className="android-intent-actions">
            <a
              href={`intent://chat?user=${encodeURIComponent(androidPromptUser)}#Intent;scheme=auri;package=com.auri.chat;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`}
              className="android-intent-open-btn"
            >
              🚀 Open in App
            </a>
            <button
              type="button"
              className="android-intent-dismiss-btn"
              onClick={() => setAndroidPromptUser(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
