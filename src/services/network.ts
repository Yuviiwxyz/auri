import type { Message, ConnectionMode, UserProfile } from '../types';
import { blobToBase64, base64ToBlob } from './storage';
import mqtt, { type MqttClient } from 'mqtt';

export type MessageReceivedHandler = (message: Message, senderPeerId: string) => void;
export type StatusUpdateHandler = (messageId: string, status: Message['status']) => void;
export type ConnectionModeHandler = (peerId: string, mode: ConnectionMode) => void;
export type TypingHandler = (senderPeerId: string, isTyping: boolean) => void;
export type ServerConnectionHandler = (connected: boolean) => void;
export interface PeerProfileData {
  displayName?: string;
  avatarColor?: string;
  avatarImage?: string;
  bio?: string;
}
export type PeerProfileUpdateHandler = (peerId: string, profile: PeerProfileData) => void;
export type ReactionReceivedHandler = (messageId: string, emoji: string, senderPeerId: string) => void;
export type MessageDeletedHandler = (messageId: string) => void;

interface PeerRTCState {
  pc: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  connectionMode: ConnectionMode;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

class NetworkService {
  private ws: WebSocket | null = null;
  private mqttClient: MqttClient | null = null;
  private peerId: string = '';
  private relayUrl: string = '';
  private isConnecting: boolean = false;
  private reconnectTimer: any = null;
  private myProfile: UserProfile | null = null;
  private outgoingWsQueue: any[] = [];

  // Active WebRTC connections: targetPeerId -> PeerRTCState
  private rtcPeers: Map<string, PeerRTCState> = new Map();

  private getPeerState(peerId: string): PeerRTCState | undefined {
    const norm = (peerId || '').trim().toLowerCase();
    for (const [key, state] of this.rtcPeers.entries()) {
      if (key.trim().toLowerCase() === norm) {
        return state;
      }
    }
    return undefined;
  }

  // Event callbacks
  private onMessageReceivedCallbacks: Set<MessageReceivedHandler> = new Set();
  private onStatusUpdateCallbacks: Set<StatusUpdateHandler> = new Set();
  private onConnectionModeCallbacks: Set<ConnectionModeHandler> = new Set();
  private onTypingCallbacks: Set<TypingHandler> = new Set();
  private onServerStatusCallbacks: Set<ServerConnectionHandler> = new Set();
  private onPeerProfileUpdateCallbacks: Set<PeerProfileUpdateHandler> = new Set();
  private onReactionCallbacks: Set<ReactionReceivedHandler> = new Set();
  private onMessageDeletedCallbacks: Set<MessageDeletedHandler> = new Set();

  public getIsConnecting(): boolean {
    return this.isConnecting;
  }

  public setMyProfile(profile: UserProfile) {
    this.myProfile = profile;
  }

  public getMyProfile(): UserProfile | null {
    return this.myProfile;
  }

  public updatePeerId(newPeerId: string) {
    if (this.peerId !== newPeerId) {
      this.peerId = newPeerId;
      if (this.mqttClient && this.mqttClient.connected) {
        const cleanId = this.peerId.trim().toLowerCase();
        this.mqttClient.subscribe(`auri/v1/peer/${cleanId}/inbox`, { qos: 1 });
        if (cleanId !== this.peerId.trim()) {
          this.mqttClient.subscribe(`auri/v1/peer/${this.peerId.trim()}/inbox`, { qos: 1 });
        }
      } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendWs({
          type: 'register',
          peerId: this.peerId,
        });
      }
    }
  }

  public broadcastProfileUpdate(profile: UserProfile, targetPeerIds?: string[]) {
    this.myProfile = profile;
    const profilePayload: PeerProfileData = {
      displayName: profile.displayName,
      avatarColor: profile.avatarColor,
      avatarImage: profile.avatarImage,
      bio: profile.bio,
    };

    const peers = targetPeerIds && targetPeerIds.length > 0 
      ? targetPeerIds 
      : Array.from(this.rtcPeers.keys());

    for (const peerId of peers) {
      if (peerId !== profile.peerId) {
        this.sendProfileUpdateToPeer(peerId, profilePayload);
      }
    }
  }

  public sendProfileUpdateToPeer(peerId: string, profileData?: PeerProfileData) {
    const data = profileData || {
      displayName: this.myProfile?.displayName,
      avatarColor: this.myProfile?.avatarColor,
      avatarImage: this.myProfile?.avatarImage,
      bio: this.myProfile?.bio,
    };

    const state = this.getPeerState(peerId);
    if (state && state.dataChannel && state.dataChannel.readyState === 'open') {
      try {
        state.dataChannel.send(JSON.stringify({
          type: 'profile-update',
          profile: data,
        }));
        return;
      } catch {}
    }

    this.sendWs({
      type: 'profile-update',
      targetPeerId: peerId.trim(),
      senderPeerId: this.peerId.trim(),
      profile: data,
    });
  }

  public init(peerId: string, relayUrl: string) {
    this.peerId = peerId;
    this.relayUrl = relayUrl;
    this.connectRelay();
  }

  public updateRelayUrl(newUrl: string) {
    if (this.relayUrl !== newUrl) {
      this.relayUrl = newUrl;
      this.disconnect();
      this.connectRelay();
    }
  }

  private failCount: number = 0;
  private readonly fallbackRelays = [
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://broker.emqx.io:8084/mqtt',
  ];

  public connectRelay() {
    if (this.mqttClient && this.mqttClient.connected) {
      return;
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    let targetUrl = this.relayUrl || 'wss://broker.hivemq.com:8884/mqtt';
    if (this.failCount >= 2) {
      const alt = this.fallbackRelays.find((u) => u !== this.relayUrl) || this.fallbackRelays[0];
      targetUrl = alt;
    }

    this.isConnecting = true;
    const isMqtt = targetUrl.includes('/mqtt') || targetUrl.includes('hivemq') || targetUrl.includes('emqx');

    if (isMqtt) {
      try {
        if (this.mqttClient) {
          try { this.mqttClient.end(true); } catch {}
          this.mqttClient = null;
        }

        const safePeer = (this.peerId || 'peer').replace(/[^a-zA-Z0-9_-]/g, '');
        const clientId = `auri_${safePeer}_${Math.random().toString(16).slice(2, 8)}`;

        const client = mqtt.connect(targetUrl, {
          clientId,
          clean: true,
          reconnectPeriod: 3000,
          connectTimeout: 8000,
        });
        this.mqttClient = client;

        client.on('connect', () => {
          this.isConnecting = false;
          this.failCount = 0;
          this.relayUrl = targetUrl;
          this.notifyServerStatus(true);

          if (this.peerId) {
            const cleanId = this.peerId.trim().toLowerCase();
            client.subscribe(`auri/v1/peer/${cleanId}/inbox`, { qos: 1 });
            if (cleanId !== this.peerId.trim()) {
              client.subscribe(`auri/v1/peer/${this.peerId.trim()}/inbox`, { qos: 1 });
            }
          }

          while (this.outgoingWsQueue.length > 0) {
            const item = this.outgoingWsQueue.shift();
            this.dispatchOutgoing(item);
          }
        });

        client.on('message', (_topic, payload) => {
          try {
            const data = JSON.parse(payload.toString());
            this.handleRelayMessage(data);
          } catch (err) {
            console.error('Failed to parse MQTT message:', err);
          }
        });

        client.on('close', () => {
          this.isConnecting = false;
          this.notifyServerStatus(false);
        });

        client.on('error', (err) => {
          console.warn('MQTT connection error:', err?.message || err);
          this.isConnecting = false;
          this.failCount++;
          this.notifyServerStatus(false);
        });
      } catch (err) {
        this.isConnecting = false;
        this.failCount++;
        this.notifyServerStatus(false);
        this.scheduleReconnect();
      }
    } else {
      // Standard WebSocket fallback
      try {
        this.ws = new WebSocket(targetUrl);

        this.ws.onopen = () => {
          this.isConnecting = false;
          this.failCount = 0;
          this.relayUrl = targetUrl;
          this.notifyServerStatus(true);
          // Register peer ID with the relay server
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
              type: 'register',
              peerId: this.peerId,
            }));

            // Drain queued outgoing packets
            while (this.outgoingWsQueue.length > 0) {
              const item = this.outgoingWsQueue.shift();
              this.dispatchOutgoing(item);
            }
          }
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleRelayMessage(data);
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        this.ws.onclose = () => {
          this.isConnecting = false;
          this.failCount++;
          this.notifyServerStatus(false);
          this.scheduleReconnect();
        };

        this.ws.onerror = () => {
          this.isConnecting = false;
          this.failCount++;
          this.notifyServerStatus(false);
        };
      } catch {
        this.isConnecting = false;
        this.failCount++;
        this.notifyServerStatus(false);
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connectRelay();
    }, 2500);
  }

  public disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.mqttClient) {
      try { this.mqttClient.end(true); } catch {}
      this.mqttClient = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    for (const [, state] of this.rtcPeers.entries()) {
      state.pc.close();
    }
    this.rtcPeers.clear();
  }

  private sendWs(payload: any) {
    if (this.dispatchOutgoing(payload)) {
      return;
    }
    this.outgoingWsQueue.push(payload);
    if (!this.isConnecting) {
      this.connectRelay();
    }
  }

  private dispatchOutgoing(payload: any): boolean {
    if (this.mqttClient && this.mqttClient.connected) {
      const target = (payload.targetPeerId || '').trim().toLowerCase();
      if (target) {
        const topic = `auri/v1/peer/${target}/inbox`;
        this.mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 });
        return true;
      }
      return true; // No recipient needed (e.g. registration packet)
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }

    return false;
  }

  // Handle incoming signaling and relay packets
  private async handleRelayMessage(data: any) {
    const { type } = data;

    switch (type) {
      case 'registered':
        // Successfully registered on relay server
        break;

      case 'signal': {
        const { senderPeerId, signalData } = data;
        await this.handleIncomingSignal(senderPeerId, signalData);
        break;
      }

      case 'profile-update': {
        const { senderPeerId, profile } = data;
        if (senderPeerId && profile) {
          this.notifyPeerProfileUpdate(senderPeerId, profile);
        }
        break;
      }

      case 'delete-message': {
        const { messageId } = data;
        if (messageId) {
          this.notifyMessageDeleted(messageId);
        }
        break;
      }

      case 'chat-message':
      case 'relay-message': {
        const { senderPeerId, message, senderProfile } = data;
        if (senderProfile && senderPeerId) {
          this.notifyPeerProfileUpdate(senderPeerId, senderProfile);
        }
        this.processIncomingMessage(message, senderPeerId, 'ephemeral-relay');
        
        // Send ACK back so server and sender know it's delivered
        this.sendWs({
          type: 'message-ack',
          targetPeerId: senderPeerId.trim(),
          senderPeerId: this.peerId.trim(),
          messageId: message.id,
          status: 'delivered',
        });
        break;
      }

      case 'message-delivered': {
        const { messageId } = data;
        this.notifyStatusUpdate(messageId, 'delivered');
        break;
      }

      case 'message-status-update': {
        const { messageId, status } = data;
        this.notifyStatusUpdate(messageId, status);
        break;
      }

      case 'typing': {
        const { senderPeerId, isTyping } = data;
        this.notifyTyping(senderPeerId, isTyping);
        break;
      }

      case 'peer-offline': {
        const { targetPeerId } = data;
        this.notifyConnectionMode(targetPeerId, 'offline');
        break;
      }

      case 'reaction': {
        const { messageId, emoji, senderPeerId } = data;
        if (messageId && emoji) {
          this.notifyReaction(messageId, emoji, senderPeerId);
        }
        break;
      }
    }
  }

  // Setup WebRTC connection for direct P2P data channels
  public async initiateWebRTC(targetPeerId: string): Promise<void> {
    const existing = this.getPeerState(targetPeerId);
    if (existing) {
      if (existing.dataChannel && existing.dataChannel.readyState === 'open') {
        return;
      }
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    const dataChannel = pc.createDataChannel('chat-channel', { ordered: true });
    
    const state: PeerRTCState = {
      pc,
      dataChannel,
      connectionMode: 'connecting',
    };
    this.rtcPeers.set(targetPeerId.trim(), state);
    this.notifyConnectionMode(targetPeerId, 'connecting');

    this.setupDataChannelEvents(dataChannel, targetPeerId);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendWs({
          type: 'signal',
          targetPeerId: targetPeerId.trim(),
          senderPeerId: this.peerId.trim(),
          signalData: { candidate: event.candidate },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        state.connectionMode = 'direct-p2p';
        this.notifyConnectionMode(targetPeerId, 'direct-p2p');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        state.connectionMode = 'ephemeral-relay';
        this.notifyConnectionMode(targetPeerId, 'ephemeral-relay');
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.sendWs({
      type: 'signal',
      targetPeerId: targetPeerId.trim(),
      senderPeerId: this.peerId.trim(),
      signalData: { sdp: offer },
    });
  }

  private async handleIncomingSignal(senderPeerId: string, signalData: any) {
    let state = this.getPeerState(senderPeerId);

    if (!state) {
      const pc = new RTCPeerConnection(ICE_SERVERS);
      state = {
        pc,
        connectionMode: 'connecting',
      };
      this.rtcPeers.set(senderPeerId.trim(), state);

      pc.ondatachannel = (event) => {
        state!.dataChannel = event.channel;
        this.setupDataChannelEvents(event.channel, senderPeerId);
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendWs({
            type: 'signal',
            targetPeerId: senderPeerId.trim(),
            senderPeerId: this.peerId.trim(),
            signalData: { candidate: event.candidate },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          state!.connectionMode = 'direct-p2p';
          this.notifyConnectionMode(senderPeerId, 'direct-p2p');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          state!.connectionMode = 'ephemeral-relay';
          this.notifyConnectionMode(senderPeerId, 'ephemeral-relay');
        }
      };
    }

    if (signalData.sdp) {
      await state.pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
      if (signalData.sdp.type === 'offer') {
        const answer = await state.pc.createAnswer();
        await state.pc.setLocalDescription(answer);
        this.sendWs({
          type: 'signal',
          targetPeerId: senderPeerId,
          signalData: { sdp: answer },
        });
      }
    } else if (signalData.candidate) {
      try {
        await state.pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
      } catch (err) {
        console.warn('Error adding ICE candidate:', err);
      }
    }
  }

  private setupDataChannelEvents(channel: RTCDataChannel, targetPeerId: string) {
    channel.onopen = () => {
      const state = this.rtcPeers.get(targetPeerId);
      if (state) {
        state.connectionMode = 'direct-p2p';
        this.notifyConnectionMode(targetPeerId, 'direct-p2p');
      }
      // Immediately exchange profile metadata with peer on direct connect
      if (this.myProfile) {
        try {
          channel.send(JSON.stringify({
            type: 'profile-update',
            profile: {
              displayName: this.myProfile.displayName,
              avatarColor: this.myProfile.avatarColor,
              avatarImage: this.myProfile.avatarImage,
              bio: this.myProfile.bio,
            }
          }));
        } catch {}
      }
    };

    channel.onclose = () => {
      const state = this.rtcPeers.get(targetPeerId);
      if (state) {
        state.connectionMode = 'ephemeral-relay';
        this.notifyConnectionMode(targetPeerId, 'ephemeral-relay');
      }
    };

    channel.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'profile-update') {
          if (payload.profile) {
            this.notifyPeerProfileUpdate(targetPeerId, payload.profile);
          }
        } else if (payload.type === 'chat-message') {
          if (payload.senderProfile) {
            this.notifyPeerProfileUpdate(targetPeerId, payload.senderProfile);
          }
          this.processIncomingMessage(payload.message, targetPeerId, 'direct-p2p');
          // ACK back over data channel
          channel.send(JSON.stringify({
            type: 'message-ack',
            messageId: payload.message.id,
            status: 'delivered',
          }));
        } else if (payload.type === 'message-ack') {
          this.notifyStatusUpdate(payload.messageId, payload.status);
        } else if (payload.type === 'typing') {
          this.notifyTyping(targetPeerId, payload.isTyping);
        } else if (payload.type === 'reaction') {
          this.notifyReaction(payload.messageId, payload.emoji, targetPeerId);
        } else if (payload.type === 'delete-message') {
          this.notifyMessageDeleted(payload.messageId);
        }
      } catch (err) {
        console.error('Error parsing data channel message:', err);
      }
    };
  }

  // Send a message: try direct WebRTC data channel first, fallback to ephemeral relay
  public async sendMessage(targetPeerId: string, message: Message): Promise<ConnectionMode> {
    // Re-hydrate Base64 if mediaBlob is present
    let serializedMessage: any = { ...message };
    if (message.mediaBlob && !message.mediaBase64) {
      const b64 = await blobToBase64(message.mediaBlob);
      serializedMessage.mediaBase64 = b64;
    }

    const senderProfilePayload: PeerProfileData | undefined = this.myProfile ? {
      displayName: this.myProfile.displayName,
      avatarColor: this.myProfile.avatarColor,
      avatarImage: this.myProfile.avatarImage,
      bio: this.myProfile.bio,
    } : undefined;

    const state = this.getPeerState(targetPeerId);
    if (state && state.dataChannel && state.dataChannel.readyState === 'open') {
      // Direct WebRTC Data Channel available! Zero-hop, zero-server
      try {
        state.dataChannel.send(JSON.stringify({
          type: 'chat-message',
          message: serializedMessage,
          senderProfile: senderProfilePayload,
        }));
        return 'direct-p2p';
      } catch {
        // If data channel send fails, fall through to relay
      }
    }

    // Always attempt direct WebRTC P2P channel establishment in background
    this.initiateWebRTC(targetPeerId).catch(() => {});

    // Fallback: Send through 24/7 cloud broker relay
    this.sendWs({
      type: 'relay-message',
      targetPeerId: targetPeerId.trim(),
      senderPeerId: this.peerId.trim(),
      message: serializedMessage,
      senderProfile: senderProfilePayload,
    });
    return 'ephemeral-relay';
  }

  public sendTyping(targetPeerId: string, isTyping: boolean) {
    const state = this.getPeerState(targetPeerId);
    if (state && state.dataChannel && state.dataChannel.readyState === 'open') {
      try {
        state.dataChannel.send(JSON.stringify({ type: 'typing', isTyping }));
        return;
      } catch {}
    }
    this.sendWs({
      type: 'typing',
      targetPeerId: targetPeerId.trim(),
      senderPeerId: this.peerId.trim(),
      isTyping,
    });
  }

  public sendReadAck(targetPeerId: string, messageId: string) {
    const state = this.getPeerState(targetPeerId);
    if (state && state.dataChannel && state.dataChannel.readyState === 'open') {
      try {
        state.dataChannel.send(JSON.stringify({
          type: 'message-ack',
          messageId,
          status: 'read',
        }));
        return;
      } catch {}
    }

    this.sendWs({
      type: 'message-ack',
      targetPeerId: targetPeerId.trim(),
      senderPeerId: this.peerId.trim(),
      messageId,
      status: 'read',
    });
  }

  public sendReaction(targetPeerId: string, messageId: string, emoji: string) {
    const state = this.getPeerState(targetPeerId);
    if (state && state.dataChannel && state.dataChannel.readyState === 'open') {
      try {
        state.dataChannel.send(JSON.stringify({
          type: 'reaction',
          messageId,
          emoji,
        }));
        return;
      } catch {}
    }

    this.sendWs({
      type: 'reaction',
      targetPeerId: targetPeerId.trim(),
      senderPeerId: this.peerId.trim(),
      messageId,
      emoji,
    });
  }

  private processIncomingMessage(rawMsg: any, senderPeerId: string, _mode: ConnectionMode) {
    const message: Message = { ...rawMsg };

    // Convert Base64 back to Blob for local IndexedDB storage
    if (message.mediaBase64 && message.mediaMime) {
      message.mediaBlob = base64ToBlob(message.mediaBase64, message.mediaMime);
    }

    message.senderId = senderPeerId;
    message.status = 'delivered';

    this.notifyMessageReceived(message, senderPeerId);
  }

  // Event Subscription methods
  public onMessageReceived(cb: MessageReceivedHandler) {
    this.onMessageReceivedCallbacks.add(cb);
    return () => this.onMessageReceivedCallbacks.delete(cb);
  }

  public onStatusUpdate(cb: StatusUpdateHandler) {
    this.onStatusUpdateCallbacks.add(cb);
    return () => this.onStatusUpdateCallbacks.delete(cb);
  }

  public onConnectionMode(cb: ConnectionModeHandler) {
    this.onConnectionModeCallbacks.add(cb);
    return () => this.onConnectionModeCallbacks.delete(cb);
  }

  public onTyping(cb: TypingHandler) {
    this.onTypingCallbacks.add(cb);
    return () => this.onTypingCallbacks.delete(cb);
  }

  public onPeerProfileUpdate(cb: PeerProfileUpdateHandler): () => void {
    this.onPeerProfileUpdateCallbacks.add(cb);
    return () => this.onPeerProfileUpdateCallbacks.delete(cb);
  }

  public onReaction(cb: ReactionReceivedHandler): () => void {
    this.onReactionCallbacks.add(cb);
    return () => this.onReactionCallbacks.delete(cb);
  }

  public onMessageDeleted(cb: MessageDeletedHandler): () => void {
    this.onMessageDeletedCallbacks.add(cb);
    return () => this.onMessageDeletedCallbacks.delete(cb);
  }

  public deleteMessage(targetPeerId: string, messageId: string) {
    const cleanTarget = (targetPeerId || '').trim();
    if (!cleanTarget || !messageId) return;

    // 1. Send over direct WebRTC Data Channel if active
    const state = this.getPeerState(cleanTarget);
    if (state && state.dataChannel && state.dataChannel.readyState === 'open') {
      try {
        state.dataChannel.send(JSON.stringify({
          type: 'delete-message',
          messageId,
          senderPeerId: this.peerId,
        }));
      } catch {}
    }

    // 2. Also send over WebSocket relay
    this.sendWs({
      type: 'delete-message',
      targetPeerId: cleanTarget,
      senderPeerId: this.peerId.trim(),
      messageId,
    });
  }

  public onServerStatus(cb: ServerConnectionHandler) {
    this.onServerStatusCallbacks.add(cb);
    return () => this.onServerStatusCallbacks.delete(cb);
  }

  private notifyMessageReceived(message: Message, senderPeerId: string) {
    this.onMessageReceivedCallbacks.forEach(cb => cb(message, senderPeerId));
  }

  private notifyStatusUpdate(messageId: string, status: Message['status']) {
    this.onStatusUpdateCallbacks.forEach(cb => cb(messageId, status));
  }

  private notifyConnectionMode(peerId: string, mode: ConnectionMode) {
    this.onConnectionModeCallbacks.forEach(cb => cb(peerId, mode));
  }

  private notifyTyping(senderPeerId: string, isTyping: boolean) {
    this.onTypingCallbacks.forEach(cb => cb(senderPeerId, isTyping));
  }

  private notifyServerStatus(connected: boolean) {
    this.onServerStatusCallbacks.forEach(cb => cb(connected));
  }

  private notifyPeerProfileUpdate(peerId: string, profile: PeerProfileData) {
    this.onPeerProfileUpdateCallbacks.forEach(cb => cb(peerId, profile));
  }

  private notifyReaction(messageId: string, emoji: string, senderPeerId: string) {
    this.onReactionCallbacks.forEach(cb => cb(messageId, emoji, senderPeerId));
  }

  private notifyMessageDeleted(messageId: string) {
    this.onMessageDeletedCallbacks.forEach(cb => cb(messageId));
  }
}

export const network = new NetworkService();
