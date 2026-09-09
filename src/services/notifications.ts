/**
 * Cross-Platform System Notification Service
 * Supports:
 * - Native Android APK status-bar notifications with sound & vibration via @capacitor/local-notifications
 * - Android browser / PWA notifications via ServiceWorker
 * - Windows / Desktop notifications via HTML5 Web Notifications
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

class NotificationService {
  private originalTitle: string = 'Auri • Local-First Android & Windows';
  private unreadCount: number = 0;
  private blinkInterval: any = null;
  private swRegistration: ServiceWorkerRegistration | null = null;
  private onNavigateCallback: ((convoId: string) => void) | null = null;
  private channelInitialized: boolean = false;

  constructor() {
    this.initServiceWorker();
    this.listenForServiceWorkerMessages();
    this.initNativeListeners();
  }

  private async initNativeListeners() {
    if (Capacitor.isNativePlatform()) {
      try {
        await this.ensureNotificationChannel();
        LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
          const convoId = action.notification.extra?.conversationId;
          if (convoId && this.onNavigateCallback) {
            this.onNavigateCallback(convoId);
          }
        });
      } catch (err) {
        console.warn('Native notification listener init error:', err);
      }
    }
  }

  private async ensureNotificationChannel() {
    if (this.channelInitialized || !Capacitor.isNativePlatform()) return;
    try {
      await LocalNotifications.createChannel({
        id: 'auri_messages',
        name: 'Auri Messages',
        description: 'Direct notifications for incoming chat messages and calls',
        importance: 5, // High importance (heads-up notification)
        visibility: 1, // Public on lockscreen
        vibration: true,
        lights: true,
      });
      this.channelInitialized = true;
    } catch (e) {
      console.warn('Could not create notification channel:', e);
    }
  }

  public async initServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!Capacitor.isNativePlatform() && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
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
    if (!Capacitor.isNativePlatform() && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
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
    if (Capacitor.isNativePlatform()) return true;
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  public getPermission(): NotificationPermissionState {
    if (Capacitor.isNativePlatform()) {
      return 'granted'; // Will check dynamically on schedule
    }
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  }

  public async requestPermission(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        await this.ensureNotificationChannel();
        const res = await LocalNotifications.requestPermissions();
        return res.display === 'granted';
      } catch {
        return false;
      }
    }

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

    // 2. Play Audio & Haptic Chime
    this.playChime();

    // 3. Trigger Native Status-Bar / System Notification
    const shouldNotify = document.hidden || !document.hasFocus() || !isViewingThisChat;

    if (shouldNotify) {
      const title = `New message from ${senderName}`;

      // A. If Native Android APK (Capacitor): Use LocalNotifications for real status-bar tray alerts
      if (Capacitor.isNativePlatform()) {
        try {
          await this.ensureNotificationChannel();
          await LocalNotifications.schedule({
            notifications: [
              {
                id: Math.floor(Math.random() * 1000000),
                title,
                body,
                channelId: 'auri_messages',
                smallIcon: 'ic_launcher_round',
                extra: {
                  conversationId: options.conversationId,
                },
              },
            ],
          });
          return;
        } catch (err) {
          console.warn('Native local notification dispatch error:', err);
        }
      }

      // B. Web Browser Environment
      if (this.getPermission() === 'granted') {
        const notificationOptions: any = {
          body,
          icon: '/logo.png',
          badge: '/favicon.png',
          tag: `auri-${options.conversationId}`,
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
