import React from 'react';

interface ReactionPickerProps {
  onSelectReaction: (emoji: string) => void;
  onClose: () => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '🚀'];

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  onSelectReaction,
  onClose,
}) => {
  return (
    <div className="reaction-popover" onClick={(e) => e.stopPropagation()}>
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="reaction-quick-btn"
          onClick={() => {
            onSelectReaction(emoji);
            onClose();
          }}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};

interface MessageReactionsBadgeProps {
  reactions?: Record<string, string[]>;
  currentUserId: string;
  onToggleReaction: (emoji: string) => void;
  isOutgoing?: boolean;
}

export const MessageReactionsBadge: React.FC<MessageReactionsBadgeProps> = ({
  reactions,
  currentUserId,
  onToggleReaction,
  isOutgoing,
}) => {
  if (!reactions || Object.keys(reactions).length === 0) return null;

  return (
    <div className={`message-reactions-row ${isOutgoing ? 'outgoing-reactions' : 'incoming-reactions'}`}>
      {Object.entries(reactions).map(([emoji, users]) => {
        if (!users || users.length === 0) return null;
        const hasReacted = users.includes(currentUserId) || users.includes('me');
        return (
          <button
            key={emoji}
            type="button"
            className={`reaction-pill ${hasReacted ? 'has-reacted' : ''} ${isOutgoing ? 'pill-outgoing' : 'pill-incoming'}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleReaction(emoji);
            }}
            title={`${users.length} reaction${users.length > 1 ? 's' : ''}`}
          >
            <span className="reaction-emoji">{emoji}</span>
            {users.length > 1 && <span className="reaction-count">{users.length}</span>}
          </button>
        );
      })}
    </div>
  );
};
