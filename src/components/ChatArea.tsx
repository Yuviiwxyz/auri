import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Mic,
  Image as ImageIcon,
  Smile,
  Check,
  CheckCheck,
  ChevronLeft,
  Smartphone,
  Monitor,
  Zap,
  Shield,
  Clock,
  Paperclip,
  Camera,
  FileText,
  Download,
  Reply,
  Copy,
  Trash2,
  X,
  CornerUpLeft,
} from 'lucide-react';
import type { Message, Conversation, MessageType, QuotedReply } from '../types';
import { WaveformPlayer } from './WaveformPlayer';
import { VoiceRecorderModal } from './VoiceRecorderModal';
import { CameraCaptureModal } from './CameraCaptureModal';
import { EmojiPicker } from './EmojiPicker';
import { ReactionPicker, MessageReactionsBadge } from './ReactionPicker';
import { ImageLightbox } from './ImageLightbox';
import { FormattedText } from './FormattedText';
import { PeerProfileModal } from './PeerProfileModal';
import { processImageFile, extractImageFromClipboard, type ProcessedImage } from '../services/media';
import type { AudioRecordingResult } from '../services/audio';

interface ChatAreaProps {
  conversation: Conversation;
  messages: Message[];
  onSendMessage: (
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
  ) => void;
  onDeleteMessage?: (messageId: string) => void;
  onBack: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onSendTyping: (isTyping: boolean) => void;
  onInitiateP2P: (peerId: string) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  conversation,
  messages,
  onSendMessage,
  onDeleteMessage,
  onBack,
  onToggleReaction,
  onSendTyping,
  onInitiateP2P,
}) => {
  const [inputText, setInputText] = useState<string>('');
  const [showEmojiPicker, setShowEmojiPicker] = useState<boolean>(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState<boolean>(false);
  const [showCameraCapture, setShowCameraCapture] = useState<boolean>(false);
  const [showAttachMenu, setShowAttachMenu] = useState<boolean>(false);
  const [showPeerProfile, setShowPeerProfile] = useState<boolean>(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [contextMenuMsg, setContextMenuMsg] = useState<Message | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; caption?: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [replyingTo, setReplyingTo] = useState<QuotedReply | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);

  // Slide-to-reply touch & drag states
  const [swipingMsgId, setSwipingMsgId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [swipeTriggered, setSwipeTriggered] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const nativeCameraRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimeoutRef = useRef<any>(null);

  // Refs for gesture handling
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isSwipingDirectionKnown = useRef<boolean>(false);
  const isSwipingHorizontal = useRef<boolean>(false);
  const longPressTimer = useRef<any>(null);
  const hasHapticFired = useRef<boolean>(false);
  const lastTapRef = useRef<{ msgId: string; time: number }>({ msgId: '', time: 0 });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const showToast = useCallback((msg: string) => {
    setToastText(msg);
    setTimeout(() => setToastText(null), 2500);
  }, []);

  const getMessageSnippet = (msg: Message): string => {
    if (msg.type === 'text') return msg.content || '';
    if (msg.type === 'voice') return '🎤 Voice note';
    if (msg.type === 'image') return '📷 Photo';
    if (msg.type === 'file') return `📎 ${msg.fileName || 'Document'}`;
    return 'Message';
  };

  const triggerReply = useCallback(
    (msg: Message) => {
      const isMe = msg.senderId === 'me';
      setReplyingTo({
        messageId: msg.id,
        senderName: isMe ? 'You' : conversation.peerName,
        type: msg.type,
        snippet: getMessageSnippet(msg),
      });
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 50);
    },
    [conversation.peerName]
  );

  // Slide-to-reply & Double-tap Touch Handlers
  const handleTouchStart = (msg: Message, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    isSwipingDirectionKnown.current = false;
    isSwipingHorizontal.current = false;
    hasHapticFired.current = false;

    // Double-tap to reply detection (within 350ms on mobile)
    const now = Date.now();
    if (lastTapRef.current.msgId === msg.id && now - lastTapRef.current.time < 350) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      triggerReply(msg);
      try {
        if (navigator.vibrate) navigator.vibrate(20);
      } catch {}
      lastTapRef.current = { msgId: '', time: 0 };
      return;
    }
    lastTapRef.current = { msgId: msg.id, time: now };

    // Start long-press timer (420ms) for action sheet
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      setContextMenuMsg(msg);
      try {
        if (navigator.vibrate) navigator.vibrate(20);
      } catch {}
    }, 420);
  };

  const handleTouchMove = (msg: Message, e: React.TouchEvent) => {
    if (!touchStartPos.current) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartPos.current.x;
    const deltaY = touch.clientY - touchStartPos.current.y;
    const isMe = msg.senderId === 'me';

    // Movement cancels long-press
    if (Math.hypot(deltaX, deltaY) > 8) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }

    // Determine swipe axis (allow right-swipe on incoming, and left or right swipe on outgoing)
    if (!isSwipingDirectionKnown.current) {
      if (Math.hypot(deltaX, deltaY) > 7) {
        isSwipingDirectionKnown.current = true;
        const validDirection = isMe ? (deltaX < -5 || deltaX > 5) : (deltaX > 5);
        if (Math.abs(deltaX) > Math.abs(deltaY) * 1.1 && validDirection) {
          isSwipingHorizontal.current = true;
        } else {
          isSwipingHorizontal.current = false;
        }
      }
    }

    // Process horizontal slide-to-reply
    if (isSwipingHorizontal.current) {
      if (e.cancelable) {
        e.preventDefault();
      }

      // Outgoing messages slide left when deltaX is negative
      const swipeSign = (isMe && deltaX < 0) ? -1 : 1;
      const absDist = Math.abs(deltaX);
      const damped = Math.min(absDist * 0.72, 60) * swipeSign;

      setSwipingMsgId(msg.id);
      setSwipeOffset(damped);

      const triggered = Math.abs(damped) >= 28;
      setSwipeTriggered(triggered);

      if (triggered && !hasHapticFired.current) {
        hasHapticFired.current = true;
        try {
          if (navigator.vibrate) navigator.vibrate(18);
        } catch {}
      } else if (!triggered && hasHapticFired.current) {
        hasHapticFired.current = false;
      }
    }
  };

  const handleTouchEnd = (msg: Message) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (swipingMsgId === msg.id) {
      if (Math.abs(swipeOffset) >= 28 || swipeTriggered) {
        triggerReply(msg);
      }
      setSwipeOffset(0);
      setSwipeTriggered(false);
      setTimeout(() => {
        setSwipingMsgId(null);
      }, 250);
    }

    touchStartPos.current = null;
    isSwipingDirectionKnown.current = false;
    isSwipingHorizontal.current = false;
  };

  // Scroll to quoted message
  const scrollToQuotedMessage = (quotedMsgId: string) => {
    const el = document.getElementById(`msg-${quotedMsgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash-highlight');
      setTimeout(() => el.classList.remove('flash-highlight'), 1800);
    }
  };

  // Handle typing indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    onSendTyping(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onSendTyping(false);
    }, 1500);
  };

  const handleSendText = () => {
    const text = inputText.trim();
    if (!text) return;

    onSendMessage('text', text, undefined, replyingTo || undefined);
    setInputText('');
    setReplyingTo(null);
    onSendTyping(false);
    setShowEmojiPicker(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  // Handle pasting images (Windows Desktop Ctrl+V)
  const handlePaste = async (e: React.ClipboardEvent) => {
    const imageFile = extractImageFromClipboard(e.nativeEvent);
    if (imageFile) {
      e.preventDefault();
      try {
        const processed = await processImageFile(imageFile);
        onSendMessage(
          'image',
          undefined,
          {
            blob: processed.blob,
            dimensions: { width: processed.width, height: processed.height },
            thumbnailBase64: processed.thumbnailBase64,
            mime: processed.mimeType,
          },
          replyingTo || undefined
        );
        setReplyingTo(null);
      } catch (err) {
        console.error('Failed to process pasted image:', err);
      }
    }
  };

  // Handle gallery image file selection
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const processed = await processImageFile(file);
      onSendMessage(
        'image',
        undefined,
        {
          blob: processed.blob,
          dimensions: { width: processed.width, height: processed.height },
          thumbnailBase64: processed.thumbnailBase64,
          mime: processed.mimeType,
        },
        replyingTo || undefined
      );
      setReplyingTo(null);
    } catch (err) {
      console.error('Failed to process image:', err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle general document/file selection
  const handleDocumentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.includes('.')
      ? file.name.split('.').pop()?.toUpperCase()
      : 'FILE';

    onSendMessage(
      'file',
      file.name,
      {
        blob: file,
        fileName: file.name,
        fileSize: file.size,
        fileExtension: extension,
        mime: file.type || 'application/octet-stream',
      },
      replyingTo || undefined
    );
    setReplyingTo(null);

    if (docInputRef.current) docInputRef.current.value = '';
  };

  // Handle camera photo snapshot
  const handlePhotoCaptured = (processed: ProcessedImage) => {
    onSendMessage(
      'image',
      undefined,
      {
        blob: processed.blob,
        dimensions: { width: processed.width, height: processed.height },
        thumbnailBase64: processed.thumbnailBase64,
        mime: processed.mimeType,
      },
      replyingTo || undefined
    );
    setReplyingTo(null);
  };

  // Drag and drop for images or files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      try {
        const processed = await processImageFile(file);
        onSendMessage(
          'image',
          undefined,
          {
            blob: processed.blob,
            dimensions: { width: processed.width, height: processed.height },
            thumbnailBase64: processed.thumbnailBase64,
            mime: processed.mimeType,
          },
          replyingTo || undefined
        );
        setReplyingTo(null);
      } catch (err) {
        console.error('Failed to process dropped image:', err);
      }
    } else {
      const extension = file.name.includes('.')
        ? file.name.split('.').pop()?.toUpperCase()
        : 'FILE';

      onSendMessage(
        'file',
        file.name,
        {
          blob: file,
          fileName: file.name,
          fileSize: file.size,
          fileExtension: extension,
          mime: file.type || 'application/octet-stream',
        },
        replyingTo || undefined
      );
      setReplyingTo(null);
    }
  };

  // Handle Voice Note result
  const handleVoiceNoteReady = (result: AudioRecordingResult) => {
    onSendMessage(
      'voice',
      undefined,
      {
        blob: result.blob,
        duration: result.duration,
        waveform: result.waveform,
        mime: result.mimeType,
      },
      replyingTo || undefined
    );
    setReplyingTo(null);
  };

  const handleEmojiSelect = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    textareaRef.current?.focus();
  };

  const handleBackspaceEmoji = () => {
    setInputText((prev) => {
      if (!prev) return '';
      const chars = Array.from(prev);
      chars.pop();
      return chars.join('');
    });
  };

  // Trigger file download
  const handleDownloadFile = (msg: Message) => {
    let url = '';
    if (msg.mediaBlob) {
      url = URL.createObjectURL(msg.mediaBlob);
    } else if (msg.mediaBase64) {
      url = `data:${msg.mediaMime || 'application/octet-stream'};base64,${msg.mediaBase64}`;
    }
    if (!url) return;

    const a = document.createElement('a');
    a.href = url;
    a.download = msg.fileName || msg.content || 'downloaded-file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (msg.mediaBlob) {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isPeerAndroid = conversation.peerId.startsWith('AND');

  return (
    <main
      className="chat-area-container"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Toast Notification */}
      {toastText && (
        <div className="chat-floating-toast">
          <span>{toastText}</span>
        </div>
      )}

      {/* Drag & Drop Overlay */}
      {isDragOver && (
        <div className="drag-drop-overlay">
          <ImageIcon size={48} className="drag-icon" />
          <p>Drop image or file here to send</p>
        </div>
      )}

      {/* Chat Header - Clickable for Peer Profile inspection */}
      <header className="chat-header">
        <button
          type="button"
          className="chat-back-btn"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          <ChevronLeft size={24} />
        </button>

        <div
          className="header-avatar header-clickable"
          style={{ backgroundColor: conversation.peerAvatar || '#6366f1' }}
          onClick={() => setShowPeerProfile(true)}
          title="Click to view contact profile & bio"
        >
          {conversation.peerAvatarImage ? (
            <img
              src={conversation.peerAvatarImage}
              alt={conversation.peerName}
              className="header-avatar-img"
            />
          ) : isPeerAndroid ? (
            <Smartphone size={18} />
          ) : (
            <Monitor size={18} />
          )}
        </div>

        <div
          className="header-peer-info header-clickable"
          onClick={() => setShowPeerProfile(true)}
          title="Click to view contact profile & bio"
        >
          <div className="peer-title-row">
            <h2 className="peer-name">{conversation.peerName}</h2>
            <span className="peer-id-tag">@{conversation.peerId}</span>
          </div>
          {conversation.peerBio && (
            <div className="peer-bio-status" title={conversation.peerBio}>
              {conversation.peerBio}
            </div>
          )}

          <div className="peer-status-row">
            {conversation.isTyping ? (
              <span className="typing-status">Typing...</span>
            ) : conversation.connectionMode === 'direct-p2p' ? (
              <span className="connection-pill p2p">
                <Zap size={12} />
                <span>Direct P2P (WebRTC)</span>
              </span>
            ) : conversation.connectionMode === 'ephemeral-relay' ? (
              <span className="connection-pill relay">
                <Shield size={12} />
                <span>Encrypted Relay</span>
              </span>
            ) : (
              <span className="connection-pill connecting">
                <Clock size={12} />
                <span>Connecting...</span>
              </span>
            )}
          </div>
        </div>

        <div className="header-tools">
          <button
            type="button"
            className="p2p-reconnect-btn"
            onClick={() => onInitiateP2P(conversation.peerId)}
            title="Attempt Direct WebRTC P2P connection"
          >
            <Zap size={16} />
            <span>P2P Connect</span>
          </button>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <section
        className="messages-viewport"
        onClick={() => {
          setShowEmojiPicker(false);
          setActiveReactionMsgId(null);
        }}
      >
        {messages.length === 0 && (
          <div className="chat-empty-notice">
            <div className="lock-badge">
              <Shield size={20} />
            </div>
            <h3>Local-First & Encrypted</h3>
            <p>
              Messages, photos, files, and audio are stored 100% on your device with zero permanent cloud retention.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isMe = msg.senderId === 'me';
          const timeString = new Date(msg.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

          const isSwipingThis = swipingMsgId === msg.id;
          const currentOffset = isSwipingThis ? swipeOffset : 0;

          return (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              className={`message-row ${isMe ? 'msg-outgoing' : 'msg-incoming'} ${
                isSwipingThis ? 'is-swiping' : ''
              }`}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenuMsg(msg);
              }}
            >
              {/* Slide-to-Reply Glowing Arrow Backdrop */}
              <div
                className={`slide-reply-indicator ${
                  isSwipingThis && swipeTriggered ? 'triggered' : ''
                } ${isMe ? 'outgoing-indicator' : 'incoming-indicator'}`}
                style={{
                  opacity: isSwipingThis ? Math.min(Math.abs(swipeOffset) / 20, 1) : 0,
                  transform: `scale(${
                    isSwipingThis ? Math.min(0.6 + (Math.abs(swipeOffset) / 35) * 0.6, 1.25) : 0.6
                  }) ${isMe && swipeOffset < 0 ? 'scaleX(-1)' : ''}`,
                }}
              >
                <CornerUpLeft size={18} />
              </div>

              {/* Message Bubble Wrapper with Touch & Spring Physics */}
              <div
                className="message-bubble-wrapper"
                style={{
                  transform: `translateX(${currentOffset}px)`,
                  transition: isSwipingThis
                    ? 'none'
                    : 'transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                }}
                onDoubleClick={() => triggerReply(msg)}
                onTouchStart={(e) => handleTouchStart(msg, e)}
                onTouchMove={(e) => handleTouchMove(msg, e)}
                onTouchEnd={() => handleTouchEnd(msg)}
                onTouchCancel={() => handleTouchEnd(msg)}
              >
                {/* Desktop / Touch Quick Reply Button */}
                <button
                  type="button"
                  className="desktop-hover-reply-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerReply(msg);
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    triggerReply(msg);
                  }}
                  title="Reply to message"
                >
                  <Reply size={13} />
                </button>

                {/* Reaction Popover (legacy direct trigger) */}
                {activeReactionMsgId === msg.id && (
                  <ReactionPicker
                    onSelectReaction={(emoji) => onToggleReaction(msg.id, emoji)}
                    onClose={() => setActiveReactionMsgId(null)}
                  />
                )}

                <div className={`message-bubble ${msg.type}`}>
                  {/* Quoted Reply Box inside Bubble */}
                  {msg.replyTo && (
                    <div
                      className="quoted-reply-box"
                      onClick={(e) => {
                        e.stopPropagation();
                        scrollToQuotedMessage(msg.replyTo!.messageId);
                      }}
                      title="Jump to quoted message"
                    >
                      <div className="quoted-sender">{msg.replyTo.senderName}</div>
                      <div className="quoted-snippet">{msg.replyTo.snippet}</div>
                    </div>
                  )}

                  {/* Text Message with Link Auto-Detection */}
                  {msg.type === 'text' && (
                    <div className="message-text-content">
                      <FormattedText text={msg.content || ''} />
                    </div>
                  )}

                  {/* Voice Note Message */}
                  {msg.type === 'voice' && (
                    <WaveformPlayer
                      blob={msg.mediaBlob}
                      base64={msg.mediaBase64}
                      mimeType={msg.mediaMime}
                      duration={msg.mediaDuration}
                      waveform={msg.mediaWaveform}
                      isMe={isMe}
                    />
                  )}

                  {/* Image Message */}
                  {msg.type === 'image' && (
                    <div
                      className="message-image-container"
                      onClick={() => {
                        let url = '';
                        if (msg.mediaBlob) {
                          url = URL.createObjectURL(msg.mediaBlob);
                        } else if (msg.mediaBase64) {
                          url = `data:${msg.mediaMime || 'image/jpeg'};base64,${msg.mediaBase64}`;
                        } else if (msg.thumbnailBase64) {
                          url = msg.thumbnailBase64;
                        }
                        if (url) {
                          setLightboxImage({ url, caption: msg.content });
                        }
                      }}
                    >
                      <img
                        src={
                          msg.mediaBlob
                            ? URL.createObjectURL(msg.mediaBlob)
                            : msg.mediaBase64
                              ? `data:${msg.mediaMime || 'image/jpeg'};base64,${msg.mediaBase64}`
                              : msg.thumbnailBase64
                        }
                        alt="Chat photo"
                        className="message-image"
                        loading="lazy"
                      />
                      {msg.content && (
                        <div className="image-caption">
                          <FormattedText text={msg.content} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* File / Document Message Card */}
                  {msg.type === 'file' && (
                    <div className="message-file-card">
                      <div className="file-card-top">
                        <div className="file-type-icon-box">
                          <FileText size={22} className="file-icon" />
                          {msg.fileExtension && (
                            <span className="file-ext-tag">{msg.fileExtension.slice(0, 4)}</span>
                          )}
                        </div>
                        <div className="file-info-details">
                          <span className="file-name-title" title={msg.fileName || msg.content}>
                            {msg.fileName || msg.content || 'Attached File'}
                          </span>
                          <span className="file-meta-sub">
                            {formatFileSize(msg.fileSize)} • Ready to open
                          </span>
                        </div>
                        <button
                          type="button"
                          className="file-download-btn"
                          onClick={() => handleDownloadFile(msg)}
                          title="Save to device"
                        >
                          <Download size={17} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Meta: Timestamp and Status ticks */}
                  <div className="message-meta-footer">
                    <span className="message-time">{timeString}</span>
                    {isMe && (
                      <span className="message-status-tick">
                        {msg.status === 'sending' && <Clock size={12} />}
                        {msg.status === 'sent' && <Check size={13} />}
                        {msg.status === 'delivered' && <CheckCheck size={13} />}
                        {msg.status === 'read' && (
                          <CheckCheck size={13} className="read-blue-tick" />
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Reaction Badges Row */}
                <MessageReactionsBadge
                  reactions={msg.reactions}
                  currentUserId="me"
                  isOutgoing={isMe}
                  onToggleReaction={(emoji) => onToggleReaction(msg.id, emoji)}
                />
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </section>

      {/* Message Long-Press & Context Action Sheet */}
      {contextMenuMsg && (
        <div className="context-menu-backdrop" onClick={() => setContextMenuMsg(null)}>
          <div
            className="message-context-sheet"
            onClick={(e) => e.stopPropagation()}
            role="menu"
            aria-label="Message options"
          >
            {/* Quick Emoji Reactions Bar */}
            <div className="sheet-reactions-bar">
              {['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="sheet-reaction-pill"
                  onClick={() => {
                    onToggleReaction(contextMenuMsg.id, emoji);
                    setContextMenuMsg(null);
                  }}
                  title={`React ${emoji}`}
                >
                  <span>{emoji}</span>
                </button>
              ))}
            </div>

            {/* Actions List */}
            <div className="sheet-actions-list">
              <button
                type="button"
                className="sheet-action-row"
                onClick={() => {
                  triggerReply(contextMenuMsg);
                  setContextMenuMsg(null);
                }}
              >
                <div className="sheet-action-icon">
                  <Reply size={18} />
                </div>
                <div className="sheet-action-info">
                  <span className="action-title">Reply to message</span>
                  <span className="action-desc">Tag this text with a quoted reply</span>
                </div>
              </button>

              {(contextMenuMsg.content || contextMenuMsg.fileName) && (
                <button
                  type="button"
                  className="sheet-action-row"
                  onClick={async () => {
                    const text = contextMenuMsg.content || contextMenuMsg.fileName || '';
                    try {
                      await navigator.clipboard.writeText(text);
                      showToast('Copied to clipboard!');
                    } catch {
                      // Fallback
                    }
                    setContextMenuMsg(null);
                  }}
                >
                  <div className="sheet-action-icon">
                    <Copy size={18} />
                  </div>
                  <div className="sheet-action-info">
                    <span className="action-title">Copy text</span>
                    <span className="action-desc">Copy message content to clipboard</span>
                  </div>
                </button>
              )}

              {onDeleteMessage && (
                <button
                  type="button"
                  className="sheet-action-row delete-row"
                  onClick={() => {
                    const id = contextMenuMsg.id;
                    setContextMenuMsg(null);
                    onDeleteMessage(id);
                    showToast('Message deleted');
                  }}
                >
                  <div className="sheet-action-icon delete-icon">
                    <Trash2 size={18} />
                  </div>
                  <div className="sheet-action-info">
                    <span className="action-title text-danger">Delete message</span>
                    <span className="action-desc">Remove from local device storage</span>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Peer Profile Modal */}
      <PeerProfileModal
        isOpen={showPeerProfile}
        conversation={conversation}
        onClose={() => setShowPeerProfile(false)}
        onInitiateP2P={onInitiateP2P}
      />

      {/* Full-screen Image Lightbox */}
      {lightboxImage && (
        <ImageLightbox
          imageUrl={lightboxImage.url}
          caption={lightboxImage.caption}
          onClose={() => setLightboxImage(null)}
        />
      )}

      {/* Voice Note Recorder Modal */}
      <VoiceRecorderModal
        isOpen={showVoiceRecorder}
        onClose={() => setShowVoiceRecorder(false)}
        onSendAudio={handleVoiceNoteReady}
      />

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={showCameraCapture}
        onClose={() => setShowCameraCapture(false)}
        onPhotoCaptured={handlePhotoCaptured}
      />

      {/* Native App-Style Emoji Keyboard Dock (Replaces unstyled web popup) */}
      {showEmojiPicker && (
        <div className="emoji-picker-anchor">
          <EmojiPicker
            onSelectEmoji={handleEmojiSelect}
            onBackspace={handleBackspaceEmoji}
            onClose={() => setShowEmojiPicker(false)}
          />
        </div>
      )}

      {/* Bottom Message Input Bar */}
      <footer className="chat-input-bar">
        {/* Quoted Reply Preview Floating Above Pill */}
        {replyingTo && (
          <div className="reply-preview-dock">
            <div className="reply-preview-accent" />
            <div className="reply-preview-body">
              <div className="reply-preview-header">
                <Reply size={13} className="reply-preview-icon" />
                <span className="reply-preview-name">Replying to {replyingTo.senderName}</span>
              </div>
              <p className="reply-preview-snippet">{replyingTo.snippet}</p>
            </div>
            <button
              type="button"
              className="reply-preview-close-btn"
              onClick={() => setReplyingTo(null)}
              aria-label="Cancel reply"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Main WhatsApp Input Row */}
        <div className="chat-input-row">
          {/* Main WhatsApp Pill Container */}
          <div className="chat-input-pill">
            {/* Emoji Toggle Button */}
            <button
              type="button"
              className={`pill-tool-btn ${showEmojiPicker ? 'active' : ''}`}
              onClick={() => {
                setShowEmojiPicker((prev) => !prev);
                setShowAttachMenu(false);
              }}
              title="Insert Emoji"
            >
              <Smile size={22} />
            </button>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              placeholder={replyingTo ? `Reply to ${replyingTo.senderName}...` : 'Type a message...'}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={1}
              className="chat-textarea"
            />

            {/* Attachment Paperclip Button */}
            <button
              type="button"
              className={`pill-tool-btn ${showAttachMenu ? 'active' : ''}`}
              onClick={() => {
                setShowAttachMenu((prev) => !prev);
                setShowEmojiPicker(false);
              }}
              title="Attach Document, Photo, or File"
            >
              <Paperclip size={20} />
            </button>

            {/* In-App Camera Button */}
            <button
              type="button"
              className="pill-tool-btn camera-icon-btn"
              onClick={() => {
                setShowCameraCapture(true);
                setShowAttachMenu(false);
              }}
              title="Open Camera Viewfinder"
            >
              <Camera size={20} />
            </button>

            {/* Hidden File Pickers */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageFileChange}
            />
            <input
              ref={docInputRef}
              type="file"
              accept="*/*"
              style={{ display: 'none' }}
              onChange={handleDocumentChange}
            />
            <input
              ref={nativeCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleImageFileChange}
            />
          </div>

          {/* Dynamic Action Button: Mic when empty, Send when text entered */}
          {inputText.trim() ? (
            <button
              type="button"
              className="chat-action-circle send-btn"
              onClick={handleSendText}
              title="Send Message"
            >
              <Send size={18} />
            </button>
          ) : (
            <button
              type="button"
              className="chat-action-circle mic-btn"
              onClick={() => setShowVoiceRecorder(true)}
              title="Record Voice Note"
            >
              <Mic size={20} />
            </button>
          )}
        </div>

        {/* WhatsApp-Style Attachment Popover Menu */}
        {showAttachMenu && (
          <div className="attachment-popover" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="attach-item-btn"
              onClick={() => {
                fileInputRef.current?.click();
                setShowAttachMenu(false);
              }}
            >
              <div className="attach-item-icon gallery">
                <ImageIcon size={20} />
              </div>
              <span>Photo Gallery</span>
            </button>

            <button
              type="button"
              className="attach-item-btn"
              onClick={() => {
                docInputRef.current?.click();
                setShowAttachMenu(false);
              }}
            >
              <div className="attach-item-icon document">
                <FileText size={20} />
              </div>
              <span>Document / File</span>
            </button>

            <button
              type="button"
              className="attach-item-btn"
              onClick={() => {
                nativeCameraRef.current?.click();
                setShowAttachMenu(false);
              }}
            >
              <div className="attach-item-icon camera">
                <Camera size={20} />
              </div>
              <span>System Camera</span>
            </button>
          </div>
        )}
      </footer>
    </main>
  );
};
