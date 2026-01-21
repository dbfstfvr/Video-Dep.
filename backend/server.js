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

// Enable CORS for frontend (Allow all origins for Vercel/Localhost)
app.use(cors({
    origin: true, // Reflects the request origin, effectively allowing all
    credentials: true
}));

app.use(express.json());

// DEBUG: Log all requests
app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.url} | Origin: ${req.get('Origin')} | Referer: ${req.get('Referer')}`);
    next();
});

// -------------------------------------------------------------
// 🛡️ SECURITY LAYER: Apply IDM Blocker to Media Routes
// -------------------------------------------------------------
// Apply strictly to streaming endpoint only
app.use('/api/stream', blockIDM);


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
// 2. Serve the Stream (Generic Proxy)
app.get('/api/stream', async (req, res) => {
    const { token, url } = req.query;

    if (!token || !url) {
        return res.status(403).json({ error: 'Missing token or url' });
    }

    // In a real app, verify the token here.

    const upstreamUrl = decodeURIComponent(url);
    console.log(`🔄 Proxying to: ${upstreamUrl}`);

    try {
        // Check if it's an HLS playlist
        if (upstreamUrl.includes('.m3u8')) {
            const response = await axios({
                method: 'get',
                url: upstreamUrl,
                responseType: 'text'
            });

            let originalManifest = response.data;
            const baseUrl = upstreamUrl.substring(0, upstreamUrl.lastIndexOf('/') + 1);

            let modifiedManifest = originalManifest.split('\n').map(line => {
                if (line.trim() && !line.trim().startsWith('#')) {
                    // It's a segment/playlist path
                    // We need to resolve it to an absolute URL if it is relative
                    let absoluteSegmentUrl = line.startsWith('http') ? line : baseUrl + line;

                    // Rewrite it to point back to OUR proxy
                    // We must encode the segment URL so it passes correctly as a param
                    return `${req.protocol}://${req.get('host')}/api/stream?token=${token}&url=${encodeURIComponent(absoluteSegmentUrl)}`;
                }
                return line;
            }).join('\n');

            res.set('Content-Type', 'application/vnd.apple.mpegurl');
            return res.send(modifiedManifest);
        }

        // Standard File Proxy (MP4, Audio, or HLS Segment)
        // CRITICAL: Forward Range Headers for Video Seeking
        const headers = {};
        if (req.headers.range) {
            headers['Range'] = req.headers.range;
        }

        // Use a generic Browser UA to avoid filtering by upstream
        headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

        const response = await axios({
            method: 'get',
            url: upstreamUrl,
            responseType: 'stream',
            headers: headers,
            validateStatus: (status) => status >= 200 && status < 300 // Accept 206
        });

        // Forward Vital Headers for Playback
        const headerKeys = ['content-range', 'accept-ranges', 'content-length', 'content-type'];
        headerKeys.forEach(key => {
            if (response.headers[key]) {
                res.set(key, response.headers[key]);
            }
        });

        // Forward the upstream status (200 or 206)
        res.status(response.status);

        response.data.pipe(res);

    } catch (err) {
        console.error(`❌ Proxy Error:`, err.message);
        res.status(500).send('Stream Proxy Failed');
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🔒 Secure Backend Running on http://localhost:${PORT}`);
    console.log(`🛡️  IDM Protection Active`);
});
