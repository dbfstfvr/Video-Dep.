import express from 'express';
import session from 'express-session';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = 3000;

// 1. Trust Proxy (Crucial for Vercel/Render/Tunnels to handle Secure Cookies)
app.set('trust proxy', 1);

// 2. CORS: Explicit & Permissive Config
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        // Dynamically allow all origins for development to fix the tunnel issue
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['X-Requested-With', 'content-type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable Pre-Flight for all routes

app.use(express.json());

// 3. SECURE SESSION SETUP
// This links the token to the specific browser session. DL Managers won't have this cookie.
app.use(session({
    secret: 'video-protection-secret-key-999', // Change in production
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false, // Set to FALSE for Localhost (HTTP)
        sameSite: 'lax', // Relaxed for local dev
        maxAge: 3600 * 1000 // 1 Hour
    }
}));

// DEBUG: Log Requests to help user troubleshoot
app.use((req, res, next) => {
    // console.log(`[${req.method}] ${req.url} | SessionID: ${req.sessionID} | Auth: ${req.session.media_ok}`);
    next();
});

// -------------------------------------------------------------------------
// 🔒 ROUTE 1: INITIALIZE SESSION (Frontend calls this first)
// -------------------------------------------------------------------------
app.post('/api/init-session', (req, res) => {
    // In a real app, verify user authentication here (e.g., req.user)

    // Set the "Media OK" flag in this specific browser's secure session
    req.session.media_ok = true;

    // Force save to ensure cookie is ready before next request
    req.session.save((err) => {
        if (err) {
            console.error("Session Save Error:", err);
            return res.status(500).json({ error: "Session Error" });
        }
        res.json({ success: true, message: "Secure Stream Session Established" });
    });
});

// -------------------------------------------------------------------------
// 🎥 ROUTE 2: PROTECTED STREAM PROXY
// -------------------------------------------------------------------------
app.get('/api/stream', async (req, res) => {
    const { url } = req.query;

    if (!url) return res.status(400).send("Missing URL");

    // 🛑 HARDENING: SESSION CHECK
    // If the request doesn't include the valid session cookie (e.g. IDM), BLOCK IT.
    console.log(`SESSION DEBUG: URL=${url} | cookie=${req.headers.cookie} | sessionID=${req.sessionID} | media_ok=${req.session.media_ok}`);

    if (!req.session || !req.session.media_ok) {
        console.log(`🚫 Blocked: Invalid/Missing Session from ${req.ip}`);
        return res.status(403).send("Session Invalid: Please use the official player.");
    }

    const upstreamUrl = decodeURIComponent(url);

    try {
        // HLS Playlist Handling (Rewrite to keep session valid)
        if (upstreamUrl.includes('.m3u8')) {
            const response = await axios({
                method: 'get',
                url: upstreamUrl,
                responseType: 'text'
            });

            const baseUrl = upstreamUrl.substring(0, upstreamUrl.lastIndexOf('/') + 1);
            let modifiedManifest = response.data.split('\n').map(line => {
                if (line.trim() && !line.trim().startsWith('#')) {
                    let absolute = line.startsWith('http') ? line : baseUrl + line;
                    // Rewrite segment to point to US, preserving session logic implicitly via browser cookie
                    return `${req.protocol}://${req.get('host')}/api/stream?url=${encodeURIComponent(absolute)}`;
                }
                return line;
            }).join('\n');

            res.set('Content-Type', 'application/vnd.apple.mpegurl');
            return res.send(modifiedManifest);
        }

        // Standard File/Segment Proxy with Range Support
        const headers = {};
        if (req.headers.range) headers['Range'] = req.headers.range;

        // Impersonate Browser to Upstream
        headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

        const response = await axios({
            method: 'get',
            url: upstreamUrl,
            responseType: 'stream',
            headers,
            validateStatus: (status) => status >= 200 && status < 300
        });

        const headerKeys = ['content-range', 'accept-ranges', 'content-length', 'content-type'];
        headerKeys.forEach(key => {
            if (response.headers[key]) res.set(key, response.headers[key]);
        });

        res.status(response.status);
        response.data.pipe(res);

    } catch (err) {
        // Quietly fail or log
        // console.error("Stream Proxy Error:", err.message);
        res.status(500).end();
    }
});

app.get('/', (req, res) => {
    res.send("🔒 Secure Backend is Online & Session-Hardened!");
});

app.listen(PORT, () => {
    console.log(`\n🔒 Session-Hardened Backend running on port ${PORT}`);
});
