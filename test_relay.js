import WebSocket from 'ws';

const RELAY_URL = 'ws://localhost:3001';

async function runTest() {
  console.log('Testing Zero-Retention Relay with 2 Peers across any distance...');

  // Peer 1: Windows Client
  const winWs = new WebSocket(RELAY_URL);
  // Peer 2: Android Client
  const andWs = new WebSocket(RELAY_URL);

  await new Promise((resolve) => {
    let connected = 0;
    const check = () => {
      connected++;
      if (connected === 2) resolve(true);
    };
    winWs.on('open', check);
    andWs.on('open', check);
  });

  console.log('✓ Both Windows and Android WebSocket clients connected to relay.');

  // Register peers with custom usernames and mixed cases
  winWs.send(JSON.stringify({ type: 'register', peerId: 'Alex_Windows ' }));
  andWs.send(JSON.stringify({ type: 'register', peerId: ' Tulu_Didi' }));

  let winToAndMsgReceived = false;
  let winToAndAckReceived = false;
  let andToWinMsgReceived = false;
  let andToWinAckReceived = false;
  let profileReceived = false;

  let winReactionReceived = false;
  let andReactionReceived = false;

  andWs.on('message', (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.type === 'profile-update') {
      console.log(`✓ Android received profile-update from ${data.senderPeerId}:`, data.profile.displayName);
      if (data.profile.displayName === 'Alex Master') {
        profileReceived = true;
      }
    } else if (data.type === 'chat-message') {
      console.log(`✓ Android received message from ${data.senderPeerId}:`, data.message.content);
      winToAndMsgReceived = true;
      // Send ACK back
      andWs.send(JSON.stringify({
        type: 'message-ack',
        senderPeerId: data.senderPeerId,
        messageId: data.message.id,
        status: 'delivered',
      }));
    } else if (data.type === 'message-status-update') {
      console.log(`✓ Android received delivery ACK for message ${data.messageId}: status=${data.status}`);
      andToWinAckReceived = true;
    } else if (data.type === 'reaction') {
      console.log(`✓ Android received reaction from ${data.senderPeerId}: ${data.emoji} on ${data.messageId}`);
      if (data.emoji === '❤️' && data.messageId === 'msg_and_to_win_1') {
        andReactionReceived = true;
      }
    }
  });

  winWs.on('message', (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.type === 'message-status-update') {
      console.log(`✓ Windows received delivery ACK for message ${data.messageId}: status=${data.status}`);
      winToAndAckReceived = true;
    } else if (data.type === 'chat-message') {
      console.log(`✓ Windows received message from ${data.senderPeerId}:`, data.message.content);
      andToWinMsgReceived = true;
      // Send ACK back
      winWs.send(JSON.stringify({
        type: 'message-ack',
        senderPeerId: data.senderPeerId,
        messageId: data.message.id,
        status: 'delivered',
      }));
    } else if (data.type === 'reaction') {
      console.log(`✓ Windows received reaction from ${data.senderPeerId}: ${data.emoji} on ${data.messageId}`);
      if (data.emoji === '🚀' && data.messageId === 'msg_win_to_and_1') {
        winReactionReceived = true;
      }
    }
  });

  // Wait a moment for registration
  await new Promise((r) => setTimeout(r, 500));

  // 1. Windows sends profile update to Android (targeting lowercase "tulu_didi")
  winWs.send(JSON.stringify({
    type: 'profile-update',
    targetPeerId: 'tulu_didi',
    profile: {
      displayName: 'Alex Master',
      avatarColor: '#0ea5e9',
      avatarImage: 'data:image/jpeg;base64,mockAvatarData123',
      bio: 'Living in Frutiger Aero era ✨',
    }
  }));

  // 2. Windows sends text message to Android
  winWs.send(JSON.stringify({
    type: 'relay-message',
    targetPeerId: 'tulu_didi',
    senderProfile: {
      displayName: 'Alex Master',
      avatarColor: '#0ea5e9',
      bio: 'Living in Frutiger Aero era ✨',
    },
    message: {
      id: 'msg_win_to_and_1',
      conversationId: 'convo_test',
      senderId: 'Alex_Windows',
      type: 'text',
      content: 'Hello Android from Windows across any distance! 🚀',
      timestamp: Date.now(),
      status: 'sending',
    },
  }));

  // 3. Android sends text message to Windows (targeting uppercase/mixed "alex_windows")
  andWs.send(JSON.stringify({
    type: 'relay-message',
    targetPeerId: 'alex_windows',
    senderProfile: {
      displayName: 'Tulu Didi',
      avatarColor: '#10b981',
      bio: 'Mobile user online',
    },
    message: {
      id: 'msg_and_to_win_1',
      conversationId: 'convo_test',
      senderId: 'Tulu_Didi',
      type: 'text',
      content: 'Hey Windows! I got your message and here is my reply from Android! 📱',
      timestamp: Date.now(),
      status: 'sending',
    },
  }));

  // Wait for initial messages to be delivered
  await new Promise((r) => setTimeout(r, 600));

  // 4. Windows reacts with ❤️ to Android's message
  winWs.send(JSON.stringify({
    type: 'reaction',
    targetPeerId: 'tulu_didi',
    messageId: 'msg_and_to_win_1',
    emoji: '❤️',
  }));

  // 5. Android reacts with 🚀 to Windows's message
  andWs.send(JSON.stringify({
    type: 'reaction',
    targetPeerId: 'alex_windows',
    messageId: 'msg_win_to_and_1',
    emoji: '🚀',
  }));

  // Wait for delivery & ACKs
  await new Promise((r) => setTimeout(r, 1200));

  winWs.close();
  andWs.close();

  if (winToAndMsgReceived && winToAndAckReceived && andToWinMsgReceived && andToWinAckReceived && profileReceived && winReactionReceived && andReactionReceived) {
    console.log('🎉 Symmetrical two-way multi-device relay messaging, PROFILE SYNC, & REAL-TIME REACTION SYNC test PASSED!');
    process.exit(0);
  } else {
    console.error('❌ Test failed:', {
      winToAndMsgReceived,
      winToAndAckReceived,
      andToWinMsgReceived,
      andToWinAckReceived,
      profileReceived,
      winReactionReceived,
      andReactionReceived,
    });
    process.exit(1);
  }
}

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
