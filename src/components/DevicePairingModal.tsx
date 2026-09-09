import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, QrCode, ArrowRight, Smartphone, Monitor, Camera, Share2 } from 'lucide-react';
import type { Conversation } from '../types';
import { QRScannerModal } from './QRScannerModal';
import { getShareUrl, shareInviteLink } from '../utils/url';

interface DevicePairingModalProps {
  isOpen: boolean;
  myPeerId: string;
  onClose: () => void;
  onConnectPeer: (peerId: string, peerName: string) => void;
  existingConversations: Conversation[];
}

export const DevicePairingModal: React.FC<DevicePairingModalProps> = ({
  isOpen,
  myPeerId,
  onClose,
  onConnectPeer,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [targetPeerId, setTargetPeerId] = useState<string>('');
  const [targetPeerName, setTargetPeerName] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'my-code' | 'connect-peer'>('my-code');
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && myPeerId) {
      const accountUrl = getShareUrl(myPeerId);

      QRCode.toDataURL(accountUrl, {
        width: 240,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch(console.error);
    }
  }, [isOpen, myPeerId]);

  if (!isOpen) return null;

  const handleCopyPeerId = async () => {
    const accountUrl = getShareUrl(myPeerId);
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(accountUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareInvite = async () => {
    const result = await shareInviteLink(myPeerId);
    if (result.copied) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConnectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = targetPeerId.trim().replace(/^@/, '');
    if (!cleanId) return;

    const defaultName = cleanId.startsWith('AND') ? 'Android Phone' : cleanId.startsWith('WIN') ? 'Windows PC' : cleanId;
    const name = targetPeerName.trim() || defaultName;

    onConnectPeer(cleanId, name);
    onClose();
  };

  const handleScanSuccess = (scannedPeerId: string) => {
    const cleanId = scannedPeerId.trim().replace(/^@/, '');
    const defaultName = cleanId.startsWith('AND') ? 'Android Phone' : cleanId.startsWith('WIN') ? 'Windows PC' : cleanId;
    onConnectPeer(cleanId, defaultName);
    setIsScannerOpen(false);
    onClose();
  };

  const isAndroid = /Android/i.test(navigator.userAgent);

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="pairing-card" onClick={(e) => e.stopPropagation()}>
          <div className="pairing-header">
            <div className="pairing-title-group">
              <QrCode size={22} className="pairing-icon" />
              <h3>Pair Android & Windows</h3>
            </div>
            <button type="button" className="modal-close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          {/* Mode Selector Tabs */}
          <div className="pairing-tabs">
            <button
              type="button"
              className={`pairing-tab-btn ${activeTab === 'my-code' ? 'active' : ''}`}
              onClick={() => setActiveTab('my-code')}
            >
              My Account & QR
            </button>
            <button
              type="button"
              className={`pairing-tab-btn ${activeTab === 'connect-peer' ? 'active' : ''}`}
              onClick={() => setActiveTab('connect-peer')}
            >
              Connect to User
            </button>
          </div>

          {activeTab === 'my-code' ? (
            <div className="my-code-section">
              <p className="pairing-description">
                Scan this QR code from your other device, or share your account link to chat across any distance with zero server data retention.
              </p>

              <div className="qr-container">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Pairing QR Code" className="qr-image" />
                ) : (
                  <div className="qr-skeleton">Generating QR...</div>
                )}
              </div>

              <div className="peer-id-badge-container">
                <span className="device-type-icon">
                  {isAndroid ? <Smartphone size={18} /> : <Monitor size={18} />}
                </span>
                <span className="my-peer-id-text">@{myPeerId}</span>
                <button
                  type="button"
                  className="copy-peer-btn"
                  onClick={handleCopyPeerId}
                  title="Copy Account Link"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  className="copy-peer-btn share-invite-btn"
                  onClick={handleShareInvite}
                  title="Share invite via WhatsApp, Messages, or social apps"
                >
                  <Share2 size={16} />
                  <span>Share</span>
                </button>
              </div>

              <div className="quick-scan-prompt">
                <button
                  type="button"
                  className="aero-scan-action-btn"
                  onClick={() => setIsScannerOpen(true)}
                >
                  <Camera size={18} />
                  <span>Scan Other Device's QR</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="connect-peer-section">
              <div className="qr-scan-shortcut">
                <button
                  type="button"
                  className="aero-scan-action-btn full-width"
                  onClick={() => setIsScannerOpen(true)}
                >
                  <Camera size={18} />
                  <span>Scan QR Code with Camera or Photo</span>
                </button>
                <div className="or-divider">
                  <span>OR ENTER USERNAME MANUALLY</span>
                </div>
              </div>

              <form className="connect-peer-form" onSubmit={handleConnectSubmit}>
                <div className="form-group">
                  <label htmlFor="peer-id-input">Username or Device Code *</label>
                  <input
                    id="peer-id-input"
                    type="text"
                    placeholder="e.g. tulu_didi, alex99, or AND-5921"
                    value={targetPeerId}
                    onChange={(e) => setTargetPeerId(e.target.value)}
                    required
                    autoFocus
                    className="pairing-input"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="peer-name-input">Display Name (Optional)</label>
                  <input
                    id="peer-name-input"
                    type="text"
                    placeholder="e.g. My Friend or Work Laptop"
                    value={targetPeerName}
                    onChange={(e) => setTargetPeerName(e.target.value)}
                    className="pairing-input"
                  />
                </div>

                <button type="submit" className="start-chat-btn">
                  <span>Connect & Start Chatting</span>
                  <ArrowRight size={18} />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* QR Scanner Submodal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </>
  );
};

