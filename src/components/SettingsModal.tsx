import React, { useState, useRef } from 'react';
import { X, HardDrive, Download, Upload, Trash2, Server, Volume2, ShieldCheck, Check, Bell, BellRing, User, Image as ImageIcon, Copy } from 'lucide-react';
import type { UserProfile } from '../types';
import { exportLocalData, importLocalData } from '../services/storage';
import { notifications } from '../services/notifications';

interface SettingsModalProps {
  isOpen: boolean;
  profile: UserProfile;
  onClose: () => void;
  onSaveProfile: (profile: UserProfile) => void;
  onClearAllData: () => void;
  messageCount: number;
  convoCount: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  profile,
  onClose,
  onSaveProfile,
  onClearAllData,
  messageCount,
  convoCount,
}) => {
  const [username, setUsername] = useState<string>(profile.peerId);
  const [displayName, setDisplayName] = useState<string>(profile.displayName);
  const [avatarImage, setAvatarImage] = useState<string | undefined>(profile.avatarImage);
  const [bio, setBio] = useState<string>(profile.bio || '');
  const [relayUrl, setRelayUrl] = useState<string>(profile.relayUrl);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(profile.soundEnabled);
  const [exporting, setExporting] = useState<boolean>(false);
  const [importStatus, setImportStatus] = useState<string>('');
  const [notificationPerm, setNotificationPerm] = useState(notifications.getPermission());
  const [linkCopied, setLinkCopied] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const handleRequestNotifications = async () => {
    const granted = await notifications.requestPermission();
    setNotificationPerm(notifications.getPermission());
    if (granted) {
      notifications.showMessageNotification({
        senderName: 'AirChat',
        messageType: 'text',
        content: '🎉 System notifications enabled! You will be alerted when new messages arrive.',
        conversationId: 'system',
      });
    }
  };

  if (!isOpen) return null;

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress avatar to max 256x256
        const maxDimension = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setAvatarImage(compressedDataUrl);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim().replace(/^@/, '').replace(/[^a-zA-Z0-9_-]/g, '') || profile.peerId;
    onSaveProfile({
      ...profile,
      peerId: cleanUsername,
      displayName: displayName.trim() || profile.displayName,
      avatarImage,
      bio: bio.trim(),
      relayUrl: relayUrl.trim() || profile.relayUrl,
      soundEnabled,
    });
    onClose();
  };

  const handleExportBackup = async () => {
    try {
      setExporting(true);
      const json = await exportLocalData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chat-local-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Backup export failed:', err);
      alert('Failed to export backup.');
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportStatus('Importing...');
      const text = await file.text();
      const result = await importLocalData(text);
      setImportStatus(`Imported ${result.conversationsCount} chats and ${result.messagesCount} messages!`);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      console.error('Import failed:', err);
      setImportStatus('Import failed. Invalid backup file format.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-card" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div className="settings-title-group">
            <HardDrive size={22} className="settings-icon" />
            <h3>Settings & Local Data</h3>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} className="settings-form">
          {/* Section: Profile */}
          <div className="settings-section">
            <h4 className="section-title">
              <User size={16} style={{ display: 'inline', marginRight: 6 }} />
              My Identity & Profile
            </h4>

            {/* Avatar Row */}
            <div className="avatar-edit-row">
              <div className="avatar-preview-container">
                {avatarImage ? (
                  <img src={avatarImage} alt="Profile Avatar" className="settings-avatar-img" />
                ) : (
                  <div className="settings-avatar-placeholder">
                    {profile.peerId.startsWith('AND') ? '📱' : '💻'}
                  </div>
                )}
              </div>

              <div className="avatar-edit-controls">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleAvatarFileSelect}
                />
                <button
                  type="button"
                  className="aero-pill-btn secondary"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <ImageIcon size={15} />
                  <span>{avatarImage ? 'Change Photo' : 'Upload Photo'}</span>
                </button>
                {avatarImage && (
                  <button
                    type="button"
                    className="avatar-remove-btn"
                    onClick={() => setAvatarImage(undefined)}
                  >
                    Remove Photo
                  </button>
                )}
                <span className="field-hint">Visible across all your paired chats</span>
              </div>
            </div>

            {/* Custom Unique Username / Handle */}
            <div className="form-group" style={{ marginTop: 14 }}>
              <label htmlFor="username-input">Unique Username / Handle *</label>
              <div className="username-input-group">
                <span className="username-prefix">@</span>
                <input
                  id="username-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  className="settings-input username-field"
                  placeholder="e.g. tulu_didi or alex99"
                  maxLength={30}
                  required
                />
              </div>
              <span className="field-hint">Friends can connect with you directly using this unique handle.</span>
            </div>

            <div className="form-group">
              <label htmlFor="display-name-input">Display Name</label>
              <input
                id="display-name-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="settings-input"
                placeholder="Your Nickname"
              />
            </div>

            <div className="form-group">
              <label htmlFor="bio-input">About / Status / Bio</label>
              <textarea
                id="bio-input"
                rows={2}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="settings-input settings-textarea"
                placeholder="Write a short description or status (e.g. Always online, Living in Frutiger Aero era ✨)"
                maxLength={160}
              />
              <span className="field-char-count">{bio.length}/160</span>
            </div>

            {/* Shareable Account Link */}
            <div className="account-link-card">
              <div className="account-link-info">
                <span className="account-link-label">Your Shareable Account Link:</span>
                <span className="account-link-url">
                  {`${window.location.origin}${window.location.pathname}?user=${encodeURIComponent(username || profile.peerId)}`}
                </span>
              </div>
              <button
                type="button"
                className="aero-pill-btn secondary copy-link-btn"
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}?user=${encodeURIComponent(username || profile.peerId)}`;
                  navigator.clipboard.writeText(url);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }}
              >
                {linkCopied ? <Check size={14} /> : <Copy size={14} />}
                <span>{linkCopied ? 'Copied Link!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          {/* Section: Any-Distance Connectivity Relay */}
          <div className="settings-section">
            <h4 className="section-title">
              <Server size={16} style={{ display: 'inline', marginRight: 6 }} />
              Signaling & Ephemeral Relay Server
            </h4>
            <p className="section-description">
              Zero permanent data retention. Relays WebRTC signaling for direct P2P connections and queues messages temporarily if peer is offline.
            </p>
            <div className="form-group">
              <label htmlFor="relay-url-input">Relay WebSocket URL</label>
              <input
                id="relay-url-input"
                type="text"
                value={relayUrl}
                onChange={(e) => setRelayUrl(e.target.value)}
                placeholder="ws://localhost:3001 or wss://my-relay.fly.dev"
                className="settings-input"
              />
            </div>
          </div>

          {/* Section: Alerts & Notifications */}
          <div className="settings-section">
            <h4 className="section-title">Alerts & Notifications</h4>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
              />
              <Volume2 size={16} />
              <span>Enable audio notification chimes</span>
            </label>

            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {notificationPerm === 'granted' ? (
                  <BellRing size={18} style={{ color: '#10b981', flexShrink: 0 }} />
                ) : (
                  <Bell size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />
                )}
                <div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                    Native Windows & Android Notifications
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    {notificationPerm === 'granted'
                      ? 'Enabled • You will receive popups when minimized or in background'
                      : notificationPerm === 'denied'
                      ? 'Blocked in browser permissions'
                      : 'Allow notifications to get alerts when someone texts'}
                  </div>
                </div>
              </div>

              {notificationPerm !== 'granted' ? (
                <button
                  type="button"
                  onClick={handleRequestNotifications}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-primary)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  Enable
                </button>
              ) : (
                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>Active ✓</span>
              )}
            </div>
          </div>

          {/* Section: Local Storage & Offline Backup */}
          <div className="settings-section local-storage-section">
            <h4 className="section-title">
              <ShieldCheck size={16} style={{ display: 'inline', marginRight: 6, color: '#10b981' }} />
              Local Storage (100% On-Device)
            </h4>
            <p className="section-description">
              All messages, voice recordings, and images reside strictly on your device's local database.
            </p>
            <div className="stats-badges">
              <div className="stat-badge">
                <span className="stat-number">{convoCount}</span>
                <span className="stat-label">Conversations</span>
              </div>
              <div className="stat-badge">
                <span className="stat-number">{messageCount}</span>
                <span className="stat-label">Messages</span>
              </div>
            </div>

            <div className="backup-buttons-row">
              <button
                type="button"
                className="backup-btn export-btn"
                onClick={handleExportBackup}
                disabled={exporting}
              >
                <Download size={16} />
                <span>{exporting ? 'Exporting...' : 'Export Local Backup'}</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleImportFile}
              />
              <button
                type="button"
                className="backup-btn import-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={16} />
                <span>Import Backup</span>
              </button>
            </div>

            {importStatus && <div className="import-status-message">{importStatus}</div>}

            <button
              type="button"
              className="danger-clear-btn"
              onClick={() => {
                if (confirm('Are you sure you want to delete all local chat history and media? This cannot be undone.')) {
                  onClearAllData();
                  onClose();
                }
              }}
            >
              <Trash2 size={16} />
              <span>Wipe All Local Storage</span>
            </button>
          </div>

          <div className="settings-footer">
            <button type="button" className="cancel-settings-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="save-settings-btn">
              <Check size={16} />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
