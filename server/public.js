import localtunnel from 'localtunnel';
import http from 'http';
import https from 'https';
import './server.js'; // Starts the unified HTTP + WebSocket server on port 3001

const PORT = process.env.PORT || 3001;

async function startPublicTunnel() {
  console.log('\n🚀 Initializing Any-Distance Public Tunnel...');

  // 1. Fetch public IP (used by localtunnel as the one-time browser password)
  let publicIp = 'Loading...';
  try {
    publicIp = await new Promise((resolve) => {
      https.get('https://api.ipify.org', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data.trim()));
      }).on('error', () => resolve('Check router/network IP'));
    });
  } catch {}

  // 2. Open Localtunnel
  try {
    const tunnel = await localtunnel({ port: PORT });

    console.log('\n===============================================================');
    console.log('       🌍 AIRCHAT ANY-DISTANCE PUBLIC INTERNET ACCESS          ');
    console.log('===============================================================');
    console.log(`\n👉 PUBLIC HTTPS LINK FOR YOUR PHONE OR ANY COMPUTER:`);
    console.log(`   ${tunnel.url}`);
    console.log(`\n🔑 ONE-TIME TUNNEL PASSWORD (IF PROMPTED BY BROWSER):`);
    console.log(`   ${publicIp}`);
    console.log('\n📱 HOW TO USE FROM ANYWHERE IN THE WORLD:');
    console.log('   1. Open the URL above on your phone (using 4G/5G mobile data or any Wi-Fi).');
    console.log('   2. If prompted, paste the tunnel password above and click "Submit".');
    console.log('   3. Pair your device using the 6-character Device Code.');
    console.log('   4. Send voice notes, images, emojis, and texts across any distance!');
    console.log('===============================================================\n');

    tunnel.on('close', () => {
      console.log('Tunnel closed.');
    });

    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err);
    });
  } catch (err) {
    console.error('Failed to create public tunnel:', err);
  }
}

startPublicTunnel();
