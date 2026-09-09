import React, { useState } from 'react';
import {
  X,
  Smartphone,
  Monitor,
  Zap,
  Shield,
  Copy,
  Check,
  Share2,
  User,
  Info,
} from 'lucide-react';
import type { Conversation } from '../types';
import { shareInviteLink } from '../utils/url';

interface PeerProfileModalProps {
  isOpen: boolean;
  conversation: Conversation;
  onClose: () => void;
  onInitiateP2P: (peerId: string) => void;
}

export const PeerProfileModal: React.FC<PeerProfileModalProps> = ({
  isOpen,
  conversation,
  onClose,
  onInitiateP2P,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  if (!isOpen) return null;

  const isAndroid = conversation.peerId.toUpperCase().startsWith('AND');

  const handleCopyLink = async () => {
    const res = await shareInviteLink(conversation.peerId, conversation.peerName);
    if (res.copied || res.shared) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    }
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(`@${conversation.peerId}`);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card peer-profile-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Peer Profile"
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-row">
            <User size={20} className="modal-title-icon" />
            <h3 className="modal-title">Contact Profile</h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close profile"
          >
            <X size={18} />
          </button>
        </div>

        {/* Profile Hero */}
        <div className="peer-profile-hero">
          <div
            className="peer-profile-avatar-large"
            style={{ backgroundColor: conversation.peerAvatar || '#6366f1' }}
          >
            {conversation.peerAvatarImage ? (
              <img
                src={conversation.peerAvatarImage}
                alt={conversation.peerName}
                className="peer-profile-avatar-img"
              />
            ) : isAndroid ? (
              <Smartphone size={44} className="peer-profile-fallback-icon" />
            ) : (
              <Monitor size={44} className="peer-profile-fallback-icon" />
            )}
          </div>

          <h2 className="peer-profile-display-name">{conversation.peerName}</h2>

          <button
            type="button"
            className="peer-profile-id-chip"
            onClick={handleCopyId}
            title="Click to copy username"
          >
            <span>@{conversation.peerId}</span>
            {copiedId ? <Check size={13} className="check-success" /> : <Copy size={13} />}
          </button>
        </div>

        {/* Bio / Description Card */}
        <div className="peer-profile-section">
          <div className="section-label">
            <Info size={14} />
            <span>About / Description</span>
          </div>
          <div className="peer-profile-bio-box">
            <p className="peer-profile-bio-text">
              {conversation.peerBio?.trim() || 'No description provided yet.'}
            </p>
          </div>
        </div>

        {/* Connection & Network Status */}
        <div className="peer-profile-section">
          <div className="section-label">
            <Zap size={14} />
            <span>Connection & Device</span>
          </div>
          <div className="peer-info-grid">
            <div className="peer-info-card">
              <span className="info-card-title">Device Type</span>
              <div className="info-card-val">
                {isAndroid ? <Smartphone size={16} /> : <Monitor size={16} />}
                <span>{isAndroid ? 'Android Phone' : 'Windows PC'}</span>
              </div>
            </div>

            <div className="peer-info-card">
              <span className="info-card-title">Network Path</span>
              <div className="info-card-val">
                {conversation.connectionMode === 'direct-p2p' ? (
                  <>
                    <Zap size={16} className="text-p2p" />
                    <span>Direct WebRTC P2P</span>
                  </>
                ) : (
                  <>
                    <Shield size={16} className="text-relay" />
                    <span>Encrypted Relay</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="peer-profile-actions">
          <button
            type="button"
            className="profile-action-btn share-btn"
            onClick={handleCopyLink}
          >
            {copiedLink ? <Check size={16} className="check-success" /> : <Share2 size={16} />}
            <span>{copiedLink ? 'Link Copied to Clipboard!' : 'Share Account Link'}</span>
          </button>

          {conversation.connectionMode !== 'direct-p2p' && (
            <button
              type="button"
              className="profile-action-btn p2p-btn"
              onClick={() => {
                onInitiateP2P(conversation.peerId);
                onClose();
              }}
            >
              <Zap size={16} />
              <span>Initiate Direct WebRTC P2P</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
