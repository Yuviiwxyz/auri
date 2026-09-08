import React, { useState, useMemo, useRef } from 'react';
import { Search, X, Delete, Sparkles, Smile, ThumbsUp, Heart, Lightbulb, Utensils, Trees } from 'lucide-react';

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onBackspace?: () => void;
  onClose?: () => void;
}

interface EmojiCategory {
  id: string;
  name: string;
  tabIcon: React.ReactNode;
  emojis: { char: string; name: string }[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    name: 'Smileys & Emotion',
    tabIcon: <Smile size={18} />,
    emojis: [
      { char: '😀', name: 'grinning' },
      { char: '😃', name: 'smiling with big eyes' },
      { char: '😄', name: 'grinning face with smiling eyes' },
      { char: '😁', name: 'beaming face' },
      { char: '😆', name: 'squinting face' },
      { char: '😅', name: 'face with sweat' },
      { char: '😂', name: 'tears of joy' },
      { char: '🤣', name: 'rolling on floor laughing' },
      { char: '😊', name: 'smiling face' },
      { char: '😇', name: 'halo face' },
      { char: '🙂', name: 'slightly smiling' },
      { char: '🙃', name: 'upside-down face' },
      { char: '😉', name: 'winking' },
      { char: '😌', name: 'relieved' },
      { char: '😍', name: 'heart eyes' },
      { char: '🥰', name: 'smiling with hearts' },
      { char: '😘', name: 'blowing kiss' },
      { char: '😗', name: 'kissing' },
      { char: '😙', name: 'kissing with smiling eyes' },
      { char: '😚', name: 'kissing with closed eyes' },
      { char: '😋', name: 'savoring food' },
      { char: '😛', name: 'tongue' },
      { char: '😜', name: 'winking tongue' },
      { char: '🤪', name: 'zany' },
      { char: '😝', name: 'squinting tongue' },
      { char: '🤑', name: 'money-mouth' },
      { char: '🤗', name: 'hugging' },
      { char: '🤭', name: 'hand over mouth' },
      { char: '🤫', name: 'shushing' },
      { char: '🤔', name: 'thinking' },
      { char: '🤐', name: 'zipper mouth' },
      { char: '🤨', name: 'raised eyebrow' },
      { char: '😐', name: 'neutral' },
      { char: '😑', name: 'expressionless' },
      { char: '😶', name: 'no mouth' },
      { char: '😏', name: 'smirking' },
      { char: '😒', name: 'unamused' },
      { char: '🙄', name: 'rolling eyes' },
      { char: '😬', name: 'grimacing' },
      { char: '🤥', name: 'lying' },
      { char: '😌', name: 'relieved' },
      { char: '😔', name: 'pensive' },
      { char: '😪', name: 'sleepy' },
      { char: '🤤', name: 'drooling' },
      { char: '😴', name: 'sleeping' },
      { char: '😷', name: 'mask' },
      { char: '🤒', name: 'thermometer' },
      { char: '🤕', name: 'bandage' },
      { char: '🤢', name: 'nauseated' },
      { char: '🤮', name: 'vomiting' },
      { char: '🤧', name: 'sneezing' },
      { char: '🥵', name: 'hot face' },
      { char: '🥶', name: 'cold face' },
      { char: '🥴', name: 'woozy' },
      { char: '😵', name: 'dizzy' },
      { char: '🤯', name: 'exploding head' },
      { char: '🤠', name: 'cowboy' },
      { char: '🥳', name: 'partying' },
      { char: '😎', name: 'sunglasses cool' },
      { char: '🤓', name: 'nerd' },
      { char: '🧐', name: 'monocle' },
      { char: '😕', name: 'confused' },
      { char: '😟', name: 'worried' },
      { char: '🙁', name: 'frowning' },
      { char: '😮', name: 'open mouth' },
      { char: '😯', name: 'hushed' },
      { char: '😲', name: 'astonished' },
      { char: '😳', name: 'flushed' },
      { char: '🥺', name: 'pleading' },
      { char: '😦', name: 'frowning with open mouth' },
      { char: '😨', name: 'fearful' },
      { char: '😰', name: 'anxious with sweat' },
      { char: '😥', name: 'sad relieved' },
      { char: '😢', name: 'crying' },
      { char: '😭', name: 'loudly crying' },
      { char: '😱', name: 'screaming in fear' },
      { char: '😖', name: 'confounded' },
      { char: '😣', name: 'persevering' },
      { char: '😞', name: 'disappointed' },
      { char: '😓', name: 'downcast with sweat' },
      { char: '😩', name: 'weary' },
      { char: '😫', name: 'tired' },
      { char: '🥱', name: 'yawning' },
      { char: '😤', name: 'steam from nose' },
      { char: '😡', name: 'pouting rage' },
      { char: '😠', name: 'angry' },
      { char: '🤬', name: 'cursing symbols' },
      { char: '😈', name: 'devil smiling' },
      { char: '👿', name: 'devil angry' },
      { char: '💀', name: 'skull' },
      { char: '☠️', name: 'skull and crossbones' },
      { char: '💩', name: 'poop' },
      { char: '🤡', name: 'clown' },
      { char: '👻', name: 'ghost' },
      { char: '👽', name: 'alien' },
      { char: '🤖', name: 'robot' },
    ],
  },
  {
    id: 'gestures',
    name: 'People & Gestures',
    tabIcon: <ThumbsUp size={18} />,
    emojis: [
      { char: '👋', name: 'waving hand' },
      { char: '🤚', name: 'raised back of hand' },
      { char: '🖐️', name: 'hand splayed' },
      { char: '✋', name: 'raised hand' },
      { char: '🖖', name: 'vulcan salute' },
      { char: '👌', name: 'ok hand' },
      { char: '🤌', name: 'pinched fingers' },
      { char: '🤏', name: 'pinching hand' },
      { char: '✌️', name: 'victory hand peace' },
      { char: '🤞', name: 'crossed fingers lucky' },
      { char: '🤟', name: 'love you gesture' },
      { char: '🤘', name: 'sign of horns rock' },
      { char: '🤙', name: 'call me hand' },
      { char: '👈', name: 'pointing left' },
      { char: '👉', name: 'pointing right' },
      { char: '👆', name: 'pointing up' },
      { char: '🖕', name: 'middle finger' },
      { char: '👇', name: 'pointing down' },
      { char: '☝️', name: 'index up' },
      { char: '👍', name: 'thumbs up' },
      { char: '👎', name: 'thumbs down' },
      { char: '✊', name: 'fist' },
      { char: '👊', name: 'punch' },
      { char: '🤛', name: 'left fist' },
      { char: '🤜', name: 'right fist' },
      { char: '👏', name: 'clapping' },
      { char: '🙌', name: 'raised hands hooray' },
      { char: '👐', name: 'open hands' },
      { char: '🤲', name: 'palms together' },
      { char: '🤝', name: 'handshake deal' },
      { char: '🙏', name: 'folded hands pray thank you' },
      { char: '✍️', name: 'writing hand' },
      { char: '💅', name: 'nail polish sassy' },
      { char: '🤳', name: 'selfie' },
      { char: '💪', name: 'flexed biceps muscle strong' },
      { char: '🦾', name: 'mechanical arm' },
      { char: '🦿', name: 'mechanical leg' },
      { char: '🦵', name: 'leg' },
      { char: '🦶', name: 'foot' },
      { char: '👂', name: 'ear' },
      { char: '👃', name: 'nose' },
      { char: '🧠', name: 'brain' },
      { char: '👀', name: 'eyes' },
      { char: '👁️', name: 'eye' },
      { char: '👅', name: 'tongue' },
      { char: '👄', name: 'mouth' },
    ],
  },
  {
    id: 'hearts',
    name: 'Hearts & Vibes',
    tabIcon: <Heart size={18} />,
    emojis: [
      { char: '❤️', name: 'red heart' },
      { char: '🧡', name: 'orange heart' },
      { char: '💛', name: 'yellow heart' },
      { char: '💚', name: 'green heart' },
      { char: '💙', name: 'blue heart' },
      { char: '💜', name: 'purple heart' },
      { char: '🖤', name: 'black heart' },
      { char: '🤍', name: 'white heart' },
      { char: '🤎', name: 'brown heart' },
      { char: '💔', name: 'broken heart' },
      { char: '❤️‍🔥', name: 'heart on fire' },
      { char: '❤️‍🩹', name: 'mending heart' },
      { char: '💖', name: 'sparkling heart' },
      { char: '💗', name: 'growing heart' },
      { char: '💓', name: 'beating heart' },
      { char: '💞', name: 'revolving hearts' },
      { char: '💕', name: 'two hearts' },
      { char: '💟', name: 'heart decoration' },
      { char: '❣️', name: 'heart exclamation' },
      { char: '💌', name: 'love letter' },
      { char: '💋', name: 'kiss mark' },
      { char: '🔥', name: 'fire lit' },
      { char: '✨', name: 'sparkles shiny' },
      { char: '⭐', name: 'star' },
      { char: '🌟', name: 'glowing star' },
      { char: '💫', name: 'dizzy star' },
      { char: '⚡', name: 'lightning bolt zap' },
      { char: '💥', name: 'boom explosion' },
      { char: '💯', name: 'hundred percent' },
      { char: '🎉', name: 'party popper' },
      { char: '🎊', name: 'confetti ball' },
      { char: '🎁', name: 'wrapped gift present' },
      { char: '🏆', name: 'trophy champion' },
      { char: '🥇', name: 'first place gold medal' },
      { char: '💎', name: 'diamond gem' },
      { char: '👑', name: 'crown royalty' },
    ],
  },
  {
    id: 'objects',
    name: 'Objects & Tech',
    tabIcon: <Lightbulb size={18} />,
    emojis: [
      { char: '💡', name: 'light bulb idea' },
      { char: '💻', name: 'laptop computer pc' },
      { char: '🖥️', name: 'desktop computer' },
      { char: '📱', name: 'smartphone mobile phone' },
      { char: '⌚', name: 'smartwatch' },
      { char: '🎧', name: 'headphones music' },
      { char: '📷', name: 'camera photo' },
      { char: '📸', name: 'camera with flash' },
      { char: '📹', name: 'video recorder' },
      { char: '🎤', name: 'microphone voice' },
      { char: '🎙️', name: 'studio mic' },
      { char: '🎵', name: 'musical note' },
      { char: '🎶', name: 'musical notes' },
      { char: '🔔', name: 'bell notification' },
      { char: '🔕', name: 'bell with slash mute' },
      { char: '💬', name: 'speech bubble chat' },
      { char: '👁️‍🗨️', name: 'eye in speech bubble' },
      { char: '🔒', name: 'locked privacy security' },
      { char: '🔓', name: 'unlocked open' },
      { char: '🔑', name: 'key security' },
      { char: '🗝️', name: 'old key' },
      { char: '🚀', name: 'rocket ship blast' },
      { char: '🛸', name: 'flying saucer ufo' },
      { char: '🔋', name: 'battery power' },
      { char: '🔌', name: 'electric plug' },
      { char: '📡', name: 'satellite antenna' },
      { char: '🕹️', name: 'joystick gaming' },
      { char: '🎮', name: 'video game controller' },
      { char: '📦', name: 'package delivery box' },
      { char: '📮', name: 'postbox' },
      { char: '✉️', name: 'envelope email' },
      { char: '📝', name: 'memo notepad' },
      { char: '📁', name: 'file folder' },
      { char: '📂', name: 'open folder' },
      { char: '📎', name: 'paperclip attachment' },
      { char: '📌', name: 'pushpin' },
      { char: '📍', name: 'round pushpin map' },
      { char: '🔍', name: 'magnifying glass search' },
      { char: '🔗', name: 'link url' },
      { char: '⚙️', name: 'gear settings' },
      { char: '🛠️', name: 'tools hammer' },
    ],
  },
  {
    id: 'food',
    name: 'Food & Drink',
    tabIcon: <Utensils size={18} />,
    emojis: [
      { char: '☕', name: 'hot coffee tea beverage' },
      { char: '🍵', name: 'green tea match' },
      { char: '🧃', name: 'beverage box juice' },
      { char: '🥤', name: 'cup with straw soda' },
      { char: '🧋', name: 'boba bubble tea' },
      { char: '🍺', name: 'beer mug' },
      { char: '🍻', name: 'clinking beer mugs' },
      { char: '🍷', name: 'wine glass' },
      { char: '🍕', name: 'pizza slice' },
      { char: '🍔', name: 'hamburger burger' },
      { char: '🍟', name: 'french fries' },
      { char: '🌭', name: 'hot dog' },
      { char: '🥪', name: 'sandwich' },
      { char: '🌮', name: 'taco' },
      { char: '🌯', name: 'burrito' },
      { char: '🍜', name: 'steaming bowl ramen noodles' },
      { char: '🍣', name: 'sushi' },
      { char: '🍱', name: 'bento box' },
      { char: '🍙', name: 'rice ball' },
      { char: '🍚', name: 'cooked rice' },
      { char: '🍩', name: 'doughnut donut' },
      { char: '🍪', name: 'cookie sweet' },
      { char: '🎂', name: 'birthday cake' },
      { char: '🍰', name: 'shortcake dessert' },
      { char: '🧁', name: 'cupcake' },
      { char: '🍫', name: 'chocolate bar' },
      { char: '🍬', name: 'candy' },
      { char: '🍭', name: 'lollipop' },
      { char: '🍿', name: 'popcorn' },
      { char: '🍎', name: 'red apple fruit' },
      { char: '🍓', name: 'strawberry fruit' },
      { char: '🍉', name: 'watermelon' },
      { char: '🥑', name: 'avocado' },
    ],
  },
  {
    id: 'nature',
    name: 'Animals & Nature',
    tabIcon: <Trees size={18} />,
    emojis: [
      { char: '🐶', name: 'dog puppy pet' },
      { char: '🐱', name: 'cat kitten pet' },
      { char: '🐭', name: 'mouse' },
      { char: '🐹', name: 'hamster' },
      { char: '🐰', name: 'rabbit bunny' },
      { char: '🦊', name: 'fox' },
      { char: '🐻', name: 'bear' },
      { char: '🐼', name: 'panda' },
      { char: '🐨', name: 'koala' },
      { char: '🐯', name: 'tiger' },
      { char: '🦁', name: 'lion' },
      { char: '🐮', name: 'cow' },
      { char: '🐷', name: 'pig' },
      { char: '🐸', name: 'frog' },
      { char: '🐵', name: 'monkey' },
      { char: '🐔', name: 'chicken' },
      { char: '🐧', name: 'penguin' },
      { char: '🐦', name: 'bird' },
      { char: '🐤', name: 'baby chick' },
      { char: '🦆', name: 'duck' },
      { char: '🦅', name: 'eagle' },
      { char: '🦉', name: 'owl' },
      { char: '🦇', name: 'bat' },
      { char: '🐺', name: 'wolf' },
      { char: '🦄', name: 'unicorn' },
      { char: '🐝', name: 'honeybee' },
      { char: '🐛', name: 'bug caterpillar' },
      { char: '🦋', name: 'butterfly' },
      { char: '🐌', name: 'snail' },
      { char: '🐞', name: 'lady beetle' },
      { char: '🌸', name: 'cherry blossom' },
      { char: '🌺', name: 'hibiscus flower' },
      { char: '🌻', name: 'sunflower' },
      { char: '🌹', name: 'rose' },
      { char: '🍀', name: 'four leaf clover luck' },
      { char: '🌿', name: 'herb plant green' },
      { char: '🌴', name: 'palm tree' },
      { char: '🌲', name: 'evergreen tree pine' },
      { char: '🌈', name: 'rainbow sky' },
      { char: '☀️', name: 'sun sunny' },
      { char: '🌙', name: 'crescent moon' },
      { char: '⭐', name: 'star' },
      { char: '🌊', name: 'water wave ocean' },
    ],
  },
];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  onSelectEmoji,
  onBackspace,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const filteredEmojis = useMemo(() => {
    if (!searchQuery.trim()) {
      return EMOJI_CATEGORIES[activeTab].emojis;
    }
    const query = searchQuery.toLowerCase().trim();
    const results: { char: string; name: string }[] = [];
    const seen = new Set<string>();

    for (const cat of EMOJI_CATEGORIES) {
      for (const item of cat.emojis) {
        if (!seen.has(item.char) && (item.name.includes(query) || item.char.includes(query))) {
          seen.add(item.char);
          results.push(item);
        }
      }
    }
    return results;
  }, [searchQuery, activeTab]);

  const handleEmojiClick = (emoji: string) => {
    // Subtle tactile vibration on supported devices
    try {
      if (navigator.vibrate) navigator.vibrate(8);
    } catch {
      // Ignore
    }
    onSelectEmoji(emoji);
  };

  const handleBackspaceClick = () => {
    try {
      if (navigator.vibrate) navigator.vibrate(10);
    } catch {
      // Ignore
    }
    if (onBackspace) {
      onBackspace();
    }
  };

  return (
    <div
      className="native-emoji-keyboard-dock"
      onClick={(e) => e.stopPropagation()}
      role="region"
      aria-label="Emoji keyboard"
    >
      {/* Top Glass Search Pill */}
      <div className="emoji-dock-search-wrap">
        <div className="emoji-dock-search-pill">
          <Search size={15} className="search-dock-icon" />
          <input
            type="text"
            placeholder="Search all emojis..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="emoji-dock-search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="emoji-search-clear-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Category Tabs (shown when not searching) */}
      {!searchQuery && (
        <div className="emoji-dock-category-tabs">
          {EMOJI_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.id}
              type="button"
              className={`emoji-cat-tab-btn ${activeTab === idx ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(idx);
                if (scrollContainerRef.current) {
                  scrollContainerRef.current.scrollTop = 0;
                }
              }}
              title={cat.name}
            >
              <span className="cat-tab-icon">{cat.tabIcon}</span>
              {activeTab === idx && <span className="cat-tab-active-glow" />}
            </button>
          ))}
        </div>
      )}

      {/* Emoji Viewport Grid */}
      <div className="emoji-dock-viewport" ref={scrollContainerRef}>
        {!searchQuery && (
          <div className="emoji-section-header">
            <span>{EMOJI_CATEGORIES[activeTab].name}</span>
          </div>
        )}

        <div className="emoji-dock-grid">
          {filteredEmojis.map((emojiObj) => (
            <button
              key={emojiObj.char + emojiObj.name}
              type="button"
              className="emoji-tap-target"
              onClick={() => handleEmojiClick(emojiObj.char)}
              title={emojiObj.name}
            >
              <span className="emoji-glyph">{emojiObj.char}</span>
            </button>
          ))}
        </div>

        {filteredEmojis.length === 0 && (
          <div className="emoji-dock-empty">
            <Sparkles size={24} className="empty-sparkle" />
            <p>No matching emoji for "{searchQuery}"</p>
          </div>
        )}
      </div>

      {/* Bottom Native Keyboard Bar */}
      <div className="emoji-dock-bottom-bar">
        {onClose && (
          <button
            type="button"
            className="emoji-dock-toggle-btn"
            onClick={onClose}
            title="Switch back to keyboard"
          >
            <span>ABC</span>
          </button>
        )}

        <div className="emoji-dock-cat-dots">
          {!searchQuery ? (
            <span className="cat-name-display">{EMOJI_CATEGORIES[activeTab].name}</span>
          ) : (
            <span className="cat-name-display">{filteredEmojis.length} results</span>
          )}
        </div>

        {onBackspace && (
          <button
            type="button"
            className="emoji-dock-backspace-btn"
            onClick={handleBackspaceClick}
            title="Delete previous character"
            aria-label="Backspace"
          >
            <Delete size={20} />
          </button>
        )}
      </div>
    </div>
  );
};
