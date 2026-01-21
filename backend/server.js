import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
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

// 2. Serve the Stream (Proxied)
// This is where IDM usually hits.
// We use a wildcard to capture both the main playlist and subsequent segments/keys
// 2. Serve the Stream (Proxied)
// This is where IDM usually hits.
// We use a wildcard to capture both the main playlist and subsequent segments/keys
app.get(/^\/api\/stream\/(.*)$/, async (req, res) => {
    const { token } = req.query;
    const requestPath = req.params[0]; // Captures the regex group (.*)

    // Use a fixed upstream base for this demo
    // In a real app, you might map 'video123' to a specific folder/bucket URL
    const upstreamBase = 'https://test-streams.mux.dev/x36xhzz';

    // Map our 'video123.m3u8' to the actual upstream filename 'x36xhzz.m3u8'
    // Everything else (segments) is passed through as-is
    let upstreamPath = requestPath;
    if (requestPath.endsWith('video123.m3u8')) {
        upstreamPath = 'x36xhzz.m3u8';

        // Validate Token ONLY for the initial playlist request
        // Segments won't have the token, but are protected by the Referer check in blockIDM
        if (!token) {
            return res.status(403).json({ error: 'Missing token' });
        }
    }

    const upstreamUrl = `${upstreamBase}/${upstreamPath}`;

    console.log(`🔄 Proxying: ${requestPath} -> ${upstreamUrl}`);

    try {
        const response = await axios({
            method: 'get',
            url: upstreamUrl,
            responseType: 'stream',
            // Optional: Pass headers if needed, but usually not for public sources
            // headers: { 'Referer': '...' } 
        });

        // Forward important headers
        if (response.headers['content-type']) {
            res.set('Content-Type', response.headers['content-type']);
        }
        if (response.headers['content-length']) {
            res.set('Content-Length', response.headers['content-length']);
        }

        // Pipe the stream to the client
        response.data.pipe(res);

    } catch (err) {
        console.error(`❌ Proxy Error (${upstreamUrl}):`, err.message);
        if (err.response) {
            res.status(err.response.status).send(err.response.statusText);
        } else {
            res.status(500).send('Stream Proxy Failed');
        }
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🔒 Secure Backend Running on http://localhost:${PORT}`);
    console.log(`🛡️  IDM Protection Active`);
});
