/**
 * Cross-Platform System Notification Service
 * Supports Windows desktop notifications and Android browser / PWA notifications.
 */

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

class NotificationService {
  private originalTitle: string = 'Auri • Local-First Android & Windows';
  private unreadCount: number = 0;
  private blinkInterval: any = null;
  private swRegistration: ServiceWorkerRegistration | null = null;
  private onNavigateCallback: ((convoId: string) => void) | null = null;

  constructor() {
    this.initServiceWorker();
    this.listenForServiceWorkerMessages();
  }

  public async initServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        this.swRegistration = reg;
        return reg;
      } catch (err) {
        console.warn('ServiceWorker registration error:', err);
      }
    }
    return null;
  }

  private listenForServiceWorkerMessages() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NAVIGATE_CONVERSATION') {
          if (this.onNavigateCallback) {
            this.onNavigateCallback(event.data.conversationId);
          }
        }
      });
    }
  }

  public onNotificationNavigate(cb: (convoId: string) => void) {
    this.onNavigateCallback = cb;
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  public getPermission(): NotificationPermissionState {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  }

  public async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        await this.initServiceWorker();
      }
      return result === 'granted';
    } catch {
      return false;
    }
  }

  public playChime() {
    try {
      if (typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
          osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

          gain.gain.setValueAtTime(0.12, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start();
          osc.stop(ctx.currentTime + 0.35);
        }
      }
    } catch {
      // Audio autoplay policy fallback
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([150, 80, 150]);
      }
    } catch {}
  }

  /**
   * Display a native system/desktop/mobile notification when a message arrives
   */
  public async showMessageNotification(options: {
    senderName: string;
    messageType: 'text' | 'voice' | 'image' | 'file';
    content?: string;
    conversationId: string;
    isViewingThisChat?: boolean;
    onNotificationClick?: () => void;
  }) {
    const { senderName, messageType, content, isViewingThisChat, onNotificationClick } = options;

    let body = '';
    if (messageType === 'text') {
      body = content || 'Sent a message';
    } else if (messageType === 'voice') {
      body = '🎤 Sent a voice note';
    } else if (messageType === 'image') {
      body = content ? `📷 Image: ${content}` : '📷 Sent a photo';
    } else if (messageType === 'file') {
      body = `📎 Sent a file: ${content || 'Document'}`;
    }

    // 1. Update Document Title Badge
    this.incrementTitleBadge(senderName);

    // 2. Tactile Haptic Vibration for Mobile Devices
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([150, 80, 150]);
      }
    } catch {}

    // 3. Trigger Native OS/Browser Notification if permission granted and not actively viewing this chat
    if (this.getPermission() === 'granted') {
      const shouldNotify = document.hidden || !document.hasFocus() || !isViewingThisChat;

      if (shouldNotify) {
        const title = `New message from ${senderName}`;
        const notificationOptions: any = {
          body,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          tag: `airchat-${options.conversationId}`,
          renotify: true,
          data: { conversationId: options.conversationId },
        };

        // Try ServiceWorker showNotification first (Required on Android Chrome)
        try {
          let reg = this.swRegistration;
          if (!reg && 'serviceWorker' in navigator) {
            reg = await navigator.serviceWorker.ready;
          }

          if (reg && reg.showNotification) {
            await reg.showNotification(title, notificationOptions);
            return;
          }
        } catch {
          // Fall through to Notification constructor
        }

        // Desktop Fallback: Standard window Notification constructor
        try {
          const notification = new Notification(title, notificationOptions);
          notification.onclick = () => {
            window.focus();
            notification.close();
            if (onNotificationClick) {
              onNotificationClick();
            }
          };
        } catch (e) {
          console.warn('Notification display failed:', e);
        }
      }
    }
  }

  public clearTitleBadge() {
    this.unreadCount = 0;
    if (this.blinkInterval) {
      clearInterval(this.blinkInterval);
      this.blinkInterval = null;
    }
    document.title = this.originalTitle;
  }

  private incrementTitleBadge(senderName: string) {
    this.unreadCount++;
    if (this.blinkInterval) clearInterval(this.blinkInterval);

    let toggle = false;
    this.blinkInterval = setInterval(() => {
      toggle = !toggle;
      if (this.unreadCount <= 0) {
        document.title = this.originalTitle;
        if (this.blinkInterval) clearInterval(this.blinkInterval);
        return;
      }

      document.title = toggle
        ? `(${this.unreadCount}) New message from ${senderName}`
        : `💬 (${this.unreadCount}) Auri`;
    }, 1200);
  }
}

export const notifications = new NotificationService();
