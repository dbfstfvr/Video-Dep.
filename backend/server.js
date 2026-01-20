import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import blockIDM from './middleware/blockIDM.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Enable CORS for frontend (assuming Vite runs on 5173)
app.use(cors({
    origin: 'http://localhost:5173', // Allow your React Frontend
    credentials: true
}));

app.use(express.json());

// -------------------------------------------------------------
// 🛡️ SECURITY LAYER: Apply IDM Blocker to Media Routes
// -------------------------------------------------------------
// Apply strictly to streaming or token generation endpoints
app.use('/api/stream', blockIDM);
app.use('/api/generate-token', blockIDM);


// -------------------------------------------------------------
// 🎥 MOCK ROUTES
// -------------------------------------------------------------

// 1. Generate a temporary, signed session for the player
app.post('/api/generate-token', (req, res) => {
    // In a real app, you authenticate the user here first.
    // const user = req.user; 

    // Generate a secure token
    const token = Buffer.from(Date.now().toString()).toString('base64');

    res.json({
        token: token,
        // The URL the player should use. This points to OUR server, not the external file directly.
        // This ensures the request MUST go through our IDM blocker.
        streamUrl: `http://localhost:${PORT}/api/stream/video123.m3u8?token=${token}`
    });
});

// 2. Serve the Stream (Proxied or Direct)
// This is where IDM usually hits.
app.get('/api/stream/:filename', (req, res) => {
    const { token } = req.query;

    // Validate Token (Simple timestamp check for demo)
    if (!token) {
        return res.status(403).json({ error: 'Missing token' });
    }

    // HERE is where the magic happens.
    // Because we used `app.use('/api/stream', blockIDM)`, 
    // IDM is ALREADY blocked before reaching this code.

    // If we are here, it's a browser (or a clever bot).

    console.log(`✅ Authorized access to stream: ${req.params.filename}`);

    // In a real scenario, you stream the file content here.
    // For this demo, we'll redirect to a public sample HLS stream 
    // BUT only if they passed the IDM check.
    // Ideally, you pipe the data: `readStream.pipe(res)` so URL is never exposed.

    // Redirecting to a sample HLS stream for testing
    res.redirect('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🔒 Secure Backend Running on http://localhost:${PORT}`);
    console.log(`🛡️  IDM Protection Active`);
});
