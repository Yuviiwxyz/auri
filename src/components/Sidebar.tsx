import React, { useState } from 'react';
import {
  MessageSquarePlus,
  Settings,
  Search,
  Smartphone,
  Monitor,
  Trash2,
} from 'lucide-react';
import type { Conversation, UserProfile } from '../types';

import { notifications } from '../services/notifications';

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
  onOpenPairing: () => void;
  onOpenSettings: () => void;
  onDeleteConversation?: (id: string) => void;
  profile: UserProfile | null;
  isServerConnected: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onOpenPairing,
  onOpenSettings,
  onDeleteConversation,
  profile,
  isServerConnected,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notifPerm, setNotifPerm] = useState(notifications.getPermission());

  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.peerName.toLowerCase().includes(q) ||
      c.peerId.toLowerCase().includes(q) ||
      (c.lastMessage?.text && c.lastMessage.text.toLowerCase().includes(q))
    );
  });

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const isAndroid = /Android/i.test(navigator.userAgent);

  return (
    <aside className="sidebar-container">
      {/* App Header */}
      <div className="sidebar-header">
        <div className="app-branding">
          <div className="app-logo-badge">
            <img src="/logo.png" alt="Auri Logo" className="app-logo-img" />
          </div>
          <div className="app-title-group">
            <h1 className="app-title">Auri</h1>
            <div className="relay-status-pill" title={isServerConnected ? 'Relay online' : 'Relay disconnected'}>
              {isServerConnected ? (
                <>
                  <span className="status-dot online" />
                  <span className="status-text">Any-Distance Active</span>
                </>
              ) : (
                <>
                  <span className="status-dot offline" />
                  <span className="status-text">Relay Offline</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="icon-btn highlight-btn"
            onClick={onOpenPairing}
            title="Pair with Android or Windows Device"
          >
            <MessageSquarePlus size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onOpenSettings}
            title="Settings & Local Storage"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="sidebar-search">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search chats or device codes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {/* Notification Permission Banner */}
      {notifPerm === 'default' && (
        <div className="notif-permission-banner">
          <div className="notif-banner-text">
            <span>🔔 Enable message notifications</span>
          </div>
          <button
            type="button"
            className="notif-banner-btn"
            onClick={async () => {
              await notifications.requestPermission();
              setNotifPerm(notifications.getPermission());
            }}
          >
            Allow
          </button>
        </div>
      )}

      {/* Conversation List */}
      <div className="conversation-list">
        {filteredConversations.map((convo) => {
          const isActive = convo.id === activeConversationId;
          const isPeerAndroid = convo.peerId.startsWith('AND');

          return (
            <div
              key={convo.id}
              className={`conversation-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectConversation(convo.id)}
            >
              {/* Avatar */}
              <div
                className="convo-avatar"
                style={{ backgroundColor: convo.peerAvatar || '#6366f1' }}
              >
                {convo.peerAvatarImage ? (
                  <img src={convo.peerAvatarImage} alt={convo.peerName} className="convo-avatar-img" />
                ) : isPeerAndroid ? (
                  <Smartphone size={18} />
                ) : (
                  <Monitor size={18} />
                )}
                {convo.connectionMode === 'direct-p2p' && (
                  <span className="connection-indicator p2p" title="Direct P2P WebRTC Connected" />
                )}
                {convo.connectionMode === 'ephemeral-relay' && (
                  <span className="connection-indicator relay" title="Connected via Encrypted Relay" />
                )}
              </div>

              {/* Info */}
              <div className="convo-info">
                <div className="convo-top-row">
                  <span className="convo-name">{convo.peerName}</span>
                  <span className="convo-time">{formatTime(convo.updatedAt)}</span>
                </div>

                <div className="convo-bottom-row">
                  <div className="convo-last-msg">
                    {convo.isTyping ? (
                      <span className="typing-indicator-text">typing...</span>
                    ) : convo.lastMessage ? (
                      <span className="msg-preview-text">
                        {convo.lastMessage.type === 'voice' && '🎤 Voice note'}
                        {convo.lastMessage.type === 'image' && '📷 Photo'}
                        {convo.lastMessage.type === 'file' && `📎 ${convo.lastMessage.text || 'File'}`}
                        {convo.lastMessage.type === 'text' && convo.lastMessage.text}
                      </span>
                    ) : (
                      <span className="no-messages-yet">Tap to chat</span>
                    )}
                  </div>

                  <div className="convo-badges">
                    {convo.unreadCount > 0 && (
                      <span className="unread-badge">{convo.unreadCount}</span>
                    )}
                    <button
                      type="button"
                      className="delete-convo-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete chat with ${convo.peerName}?`)) {
                          onDeleteConversation?.(convo.id);
                        }
                      }}
                      title="Delete chat"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredConversations.length === 0 && (
          <div className="empty-conversations-state">
            <div className="empty-icon-circle">
              {isAndroid ? <Smartphone size={28} /> : <Monitor size={28} />}
            </div>
            <h4>No conversations yet</h4>
            <p>Pair your Android phone or Windows PC to start chatting across any distance.</p>
            <button
              type="button"
              className="pair-device-cta-btn"
              onClick={onOpenPairing}
            >
              <MessageSquarePlus size={16} />
              <span>Pair Device</span>
            </button>
          </div>
        )}
      </div>

      {/* User Profile Footer */}
      {profile && (
        <div className="sidebar-profile-footer" onClick={onOpenSettings} title="Click to edit profile">
          <div
            className="profile-avatar"
            style={{ backgroundColor: profile.avatarColor }}
          >
            {profile.avatarImage ? (
              <img src={profile.avatarImage} alt={profile.displayName} className="profile-avatar-img" />
            ) : (
              isAndroid ? <Smartphone size={18} /> : <Monitor size={18} />
            )}
          </div>
          <div className="profile-details">
            <div className="profile-name-row">
              <span className="profile-name">{profile.displayName}</span>
              <span className="profile-peer-id-badge">@{profile.peerId}</span>
            </div>
            {profile.bio ? (
              <span className="profile-bio-preview">{profile.bio}</span>
            ) : (
              <span className="profile-peer-id">Online • Tap to edit bio</span>
            )}
          </div>
          <button
            type="button"
            className="copy-my-id-btn"
            onClick={(e) => {
              e.stopPropagation();
              const accountLink = `${window.location.origin}${window.location.pathname}?user=${encodeURIComponent(profile.peerId)}`;
              navigator.clipboard.writeText(accountLink);
              alert(`Account link copied to clipboard!\n${accountLink}`);
            }}
            title="Copy shareable account link"
          >
            Share
          </button>
        </div>
      )}
    </aside>
  );
};
