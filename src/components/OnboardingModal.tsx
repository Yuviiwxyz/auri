import React, { useState, useRef } from 'react';
import { Camera, Sparkles, User, AtSign, FileText } from 'lucide-react';
import type { UserProfile } from '../types';

interface OnboardingModalProps {
  isOpen: boolean;
  initialProfile: UserProfile;
  onComplete: (updatedProfile: UserProfile) => void;
}

const AVATAR_COLOR_PALETTE = [
  '#0284c7', // Sky / Cerulean
  '#0ea5e9', // Sky light
  '#10b981', // Emerald
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#f59e0b', // Amber
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  initialProfile,
  onComplete,
}) => {
  // Suggest a cleaner default username if it's an auto-generated WIN-XXXX / AND-XXXX
  const defaultSuggestedUsername = () => {
    const pId = initialProfile.peerId;
    if (/^(WIN|AND)-[A-Z0-9]{4}$/i.test(pId)) {
      const isAndroid = /Android/i.test(navigator.userAgent);
      return isAndroid ? 'android_user' : 'windows_user';
    }
    return pId.replace(/^@/, '');
  };

  const [username, setUsername] = useState<string>(defaultSuggestedUsername());
  const [displayName, setDisplayName] = useState<string>(
    initialProfile.displayName && !/^(Android|Windows) User$/i.test(initialProfile.displayName)
      ? initialProfile.displayName
      : (/Android/i.test(navigator.userAgent) ? 'Android User' : 'Windows User')
  );
  const [bio, setBio] = useState<string>(
    initialProfile.bio && !initialProfile.bio.includes('AirChat')
      ? initialProfile.bio
      : 'Hey! I am using Auri Local-First ✨'
  );
  const [avatarImage, setAvatarImage] = useState<string | undefined>(initialProfile.avatarImage);
  const [avatarColor, setAvatarColor] = useState<string>(initialProfile.avatarColor || '#0284c7');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/^@/, '');
    // Allow alphanumeric, underscores, hyphens
    const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '');
    setUsername(clean);
    if (errorMsg) setErrorMsg('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanUser = username.trim().replace(/^@/, '');
    if (!cleanUser || cleanUser.length < 2) {
      setErrorMsg('Please enter a username of at least 2 characters.');
      return;
    }

    const cleanName = displayName.trim();
    if (!cleanName) {
      setErrorMsg('Please enter your display name.');
      return;
    }

    const updatedProfile: UserProfile = {
      ...initialProfile,
      peerId: cleanUser,
      displayName: cleanName,
      bio: bio.trim(),
      avatarImage,
      avatarColor,
      hasCompletedOnboarding: true,
    };

    onComplete(updatedProfile);
  };

  return (
    <div className="modal-backdrop onboarding-backdrop">
      <div className="onboarding-card" role="dialog" aria-modal="true">
        {/* Header Branding */}
        <div className="onboarding-header">
          <div className="onboarding-logo-badge">
            <span className="onboarding-logo-icon">💬</span>
          </div>
          <h2 className="onboarding-title">Welcome to Auri</h2>
          <p className="onboarding-subtitle">
            Set up your profile once. Your information is saved locally on this device so you never have to enter it again.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="onboarding-form">
          {errorMsg && (
            <div className="onboarding-error-banner" role="alert">
              <span>⚠️ {errorMsg}</span>
            </div>
          )}

          {/* Profile Picture Upload & Color Palette */}
          <div className="onboarding-pfp-section">
            <div
              className="onboarding-avatar-preview"
              style={{ backgroundColor: avatarImage ? 'transparent' : avatarColor }}
              onClick={() => fileInputRef.current?.click()}
              title="Click to upload profile photo"
            >
              {avatarImage ? (
                <img src={avatarImage} alt="Profile preview" className="onboarding-avatar-img" />
              ) : (
                <span className="onboarding-avatar-initial">
                  {(displayName.trim()[0] || username.trim()[0] || 'A').toUpperCase()}
                </span>
              )}
              <div className="onboarding-camera-badge">
                <Camera size={14} />
              </div>
            </div>

            <div className="onboarding-pfp-info">
              <button
                type="button"
                className="onboarding-upload-photo-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera size={15} />
                <span>{avatarImage ? 'Change Photo' : 'Upload Profile Photo'}</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarFileSelect}
                style={{ display: 'none' }}
              />

              {/* Color chips if no image */}
              <div className="onboarding-color-palette">
                <span className="palette-label">Or pick avatar color:</span>
                <div className="palette-chips-row">
                  {AVATAR_COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`palette-chip ${avatarColor === color && !avatarImage ? 'active' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        setAvatarColor(color);
                        setAvatarImage(undefined);
                      }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Username Input */}
          <div className="onboarding-field">
            <label className="onboarding-label" htmlFor="onboarding-username">
              <AtSign size={14} className="label-icon" />
              <span>Username (Unique ID)</span>
            </label>
            <div className="onboarding-input-wrapper">
              <span className="onboarding-input-affix">@</span>
              <input
                id="onboarding-username"
                type="text"
                className="onboarding-text-input username-input"
                placeholder="e.g. alex_m or tulu"
                value={username}
                onChange={handleUsernameChange}
                maxLength={24}
                required
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <span className="onboarding-field-hint">
              This is the unique handle other devices use to connect with you across any distance.
            </span>
          </div>

          {/* Display Name Input */}
          <div className="onboarding-field">
            <label className="onboarding-label" htmlFor="onboarding-display-name">
              <User size={14} className="label-icon" />
              <span>Display Name</span>
            </label>
            <input
              id="onboarding-display-name"
              type="text"
              className="onboarding-text-input"
              placeholder="e.g. Alex Master or Tulu Didi"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              maxLength={36}
              required
            />
            <span className="onboarding-field-hint">
              The friendly name your friends and contacts see in chats.
            </span>
          </div>

          {/* Description / Bio Input */}
          <div className="onboarding-field">
            <label className="onboarding-label" htmlFor="onboarding-bio">
              <FileText size={14} className="label-icon" />
              <span>About / Description</span>
            </label>
            <textarea
              id="onboarding-bio"
              className="onboarding-textarea-input"
              placeholder="e.g. Available • Living in Frutiger Aero era ✨"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={120}
              rows={2}
            />
            <span className="onboarding-field-hint">
              A short description shown on your profile card.
            </span>
          </div>

          {/* Submit Action */}
          <div className="onboarding-actions">
            <button type="submit" className="onboarding-submit-btn">
              <Sparkles size={18} />
              <span>Save Profile & Start Chatting</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
