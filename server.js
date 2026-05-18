/**
 * Basketball 3D Pro - Node.js Server
 * Professional 3D Basketball Game
 */

const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Main route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', game: 'Basketball 3D Pro', version: '1.0.0' });
});

app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║     🏀  Basketball 3D Pro  🏀           ║');
  console.log('║     Professional Game Server           ║');
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`  Server running at: http://localhost:${PORT}`);
  console.log(`  Open your browser and navigate to the URL above`);
  console.log('');
  console.log('  Controls:');
  console.log('  - WASD / Arrow Keys: Move player');
  console.log('  - Mouse: Aim');
  console.log('  - Left Click / Space: Shoot');
  console.log('  - R: Reset ball');
  console.log('  - C: Change camera view');
  console.log('');
});
