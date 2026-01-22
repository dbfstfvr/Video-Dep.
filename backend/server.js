import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:4173', 'https://yourdomain.com']; // Updates based on your frontend URL

app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true
}));

app.use(express.json());

// 🛡️ Middleware: Block IDM and Download Managers
const blockDownloadManagers = (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    const referer = req.headers['referer'] || '';

    // 1. List of known downloader User-Agents
    const blockedAgents = [
        'Internet Download Manager',
        'IDM',
        'JDownloader',
        'Wget',
        'curl',
        'PostmanRuntime',
        'Insomnia',
        'aria2',
        'FDM', // Free Download Manager
        'EagleGet',
        'XDM', // Xtreme Download Manager
        'GetRight',
        'Go!Zilla',
        'Download Accelerator'
    ];

    // Check if User-Agent matches any blocked agent
    const isBlockedAgent = blockedAgents.some(agent =>
        userAgent.toLowerCase().includes(agent.toLowerCase())
    );

    if (isBlockedAgent) {
        console.warn(`🚫 Blocked Request from Downloader: ${userAgent} (IP: ${req.ip})`);
        return res.status(403).json({ error: 'Access Denied: Download managers are not allowed.' });
    }

    // 2. Referer Validation (Anti-Leech)
    // Requests must come from your frontend (except for some legitimate direct browser navigation, but for API/Video it should be strict)
    // For video streams, modern browsers send Referer or Origin.
    const isAllowedReferer = ALLOWED_ORIGINS.some(origin => referer.startsWith(origin));

    // Allow legitimate browser navigations if needed, but for API/Media, enforce strict referer
    // Note: Some privacy tools might strip referer; handle with care. 
    // For high security, we enforce it.
    if (!isAllowedReferer && !req.path.includes('/public/')) {
        // Optional: Allow if it's a direct top-level navigation (Accept: text/html), but block if it's a media request
        const acceptHeader = req.headers['accept'] || '';
        if (!acceptHeader.includes('text/html')) {
            console.warn(`🚫 Blocked Missing/Invalid Referer: ${referer} (IP: ${req.ip})`);
            return res.status(403).json({ error: 'Access Denied: Invalid source.' });
        }
    }

    // 3. IDM Specific Behavior Detection
    // IDM often creates many connections with Range headers to download parts simultaneously.
    // While browsers also use Range, IDM often initiates HEAD requests or specific patterns.

    // Heuristic: If Range request exists but no standard browser Referer, it's suspicious (covered by step 2).

    next();
};

// Apply Middleware Globally or specific routes
app.use('/api', blockDownloadManagers);
app.use('/stream', blockDownloadManagers);

// 🛡️ Rate Limiting (Simple In-Memory)
// To prevent multi-connection downloading (IDM opens 8-32 connections)
const connectionMap = new Map();

const monitorConnections = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const WINDOW_MS = 10000; // 10 seconds
    const MAX_CONNECTIONS = 20; // Browsers might open a few, but IDM opens MANY.

    // Cleanup old entries
    if (!connectionMap.has(ip)) {
        connectionMap.set(ip, []);
    }

    let connections = connectionMap.get(ip);
    connections = connections.filter(time => now - time < WINDOW_MS);

    // Add current connection
    connections.push(now);
    connectionMap.set(ip, connections);

    if (connections.length > MAX_CONNECTIONS) {
        console.warn(`🚫 Rate Limit Exceeded for IP: ${ip} (${connections.length} reqs in ${WINDOW_MS / 1000}s)`);
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    next();
};

app.use('/stream', monitorConnections);


// 🎥 Stream Route (Protected)
app.get('/stream/:videoName', (req, res) => {
    const videoName = req.params.videoName;
    // Ensure we are reading from the PRIVATE storage directory
    const videoPath = path.join(__dirname, '../storage/private/videos', videoName);

    // Security: Prevent Directory Traversal
    if (!videoPath.startsWith(path.join(__dirname, '../storage/private/videos'))) {
        return res.status(403).send('Invalid path');
    }

    if (!fs.existsSync(videoPath)) {
        return res.status(404).send('Video not found');
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        // IDM uses Ranges heavily. 
        // We can add logic here: if range requests come too fast from same IP (handled by rate limit)

        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize) {
            res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
            return;
        }

        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
        };

        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
    }
});

app.get('/', (req, res) => {
    res.send('Secure Media Server is Running 🛡️');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`- IDM Protection: Active 🛡️`);
    console.log(`- Rate Limiting: Active 🛡️`);
});
