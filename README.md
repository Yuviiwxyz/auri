# Auri • Local-First Android & Windows Messaging

A private, cross-platform messaging application styled with a vibrant **Frutiger Aero / Glossy Aqua** aesthetic, built to run seamlessly on **Android** and **Windows** across any distance with **100% on-device local storage** and **zero permanent server retention**.

---

## 🌟 Key Capabilities

1. **100% Local-First Architecture (Zero Cloud Database)**
   - All messages, contacts, voice notes (audio Blobs), and photos are stored strictly in on-device **IndexedDB**.
   - Zero chat history or media is permanently retained on any server.
   - Includes one-click **Local Backup Export & Import** (`.json`) for effortless data preservation and migration.

2. **Frutiger Aero & Glossy Aqua Aesthetic**
   - Airy sky-to-cerulean gradient background inspired by classic iTunes and Aqua-era UI.
   - Animated floating colorful bubbles with GPU-accelerated wave drift.
   - Horizontal Aqua pinstripe texture and diagonal specular sheen overlays.
   - Curved glass gel message bubbles with crisp, high-contrast typography.

3. **Any-Distance Connectivity**
   - **Direct WebRTC P2P**: Devices exchange messages, voice recordings, and images directly peer-to-peer with zero intermediary bandwidth when available.
   - **Zero-Retention Ephemeral Relay**: When peers are behind strict cellular (4G/5G) or NAT firewalls, messages pass transiently through RAM with an automatic TTL and are **purged immediately upon recipient delivery ACK**.

4. **Rich Messaging & Chat Features**
   - **Slide-to-Reply & Quoted Tagging**: Slide any message to quote and reply with smooth rubber-band physics, haptic feedback, and clickable scroll-to-quoted jump.
   - **Two-Way Emoji Reactions**: Tap or long-press any message to react (👍, ❤️, 😂, 😮, 😢, 🙏, 🔥, 🚀, 🎉), synced in real time between peers.
   - **Native App Emoji Keyboard**: Docked iOS/Gboard-style keyboard with categorized tabs, search, backspace key, and touch bounce feedback.
   - **Voice Notes with Live Waveform**: Real-time microphone audio visualizer during recording, interactive 35-bar scrubber, and multi-speed playback (`1.0x` ➔ `1.5x` ➔ `2.0x`).
   - **Camera & Photos**: In-app viewfinder camera capture, gallery photo attachments with client-side canvas compression, and full-screen lightbox.
   - **File Sharing & Clickable Links**: Send documents, PDFs, and rich formatted links with custom preview cards.

5. **First-Time Device Onboarding & Custom Handles**
   - Profile picture upload (auto-compressed to 256×256 JPEG) or custom color avatars.
   - Unique `@username` handles for clean pairing and shareable invitation links (`?user=username`).
   - Friendly display names and about/status bios, saved permanently on each device.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run for Any Distance (Different Networks / 4G / 5G Mobile Cellular)
```bash
npm run online
```
*Generates a secure public HTTPS URL via Cloudflare Tunnel that can be opened from any phone or computer anywhere in the world on any network.*

### 3. Run Locally (Same Network / Localhost)
```bash
npm run server
npm run dev
```
Open `http://localhost:5173` on your PC and `http://<your-local-ip>:5173` on your phone.

---

## 📱 Pairing Android and Windows

1. **On Windows or Android**:
   - Click **"Pair Device"** (`+`) in the sidebar header.
   - Either scan the QR code from the other device or type in the peer's `@username`.
2. **Instant Connection**:
   - Both devices immediately establish an encrypted link and can exchange messages, voice notes, photos, and live reactions.

---

## 🧪 Automated Testing

Run the multi-device relay, profile update, and reaction synchronization test:
```bash
npm run test:relay
```
