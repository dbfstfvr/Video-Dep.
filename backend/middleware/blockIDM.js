/**
 * Middleware to block Download Managers (IDM, JDownloader, etc.)
 * by inspecting User-Agent and Referer headers.
 */
const blockIDM = (req, res, next) => {
    const userAgent = req.get('User-Agent') || '';
    const referer = req.get('Referer') || '';

    // 1. List of known Download Manager Signatures
    const blockedAgents = [
        'IDM',
        'Internet Download Manager',
        'JDownloader',
        'curl',
        'Wget',
        'Aria2',
        'Go-http-client',
        'Python-urllib',
        'FDM',
        'EagleGet',
        'Free Download Manager',
        'DownloadAccelerator',
        'PostmanRuntime'
    ];

    // 2. Check if User-Agent matches any blocked signature
    const isBlockedAgent = blockedAgents.some(agent =>
        userAgent.toLowerCase().includes(agent.toLowerCase())
    );

    if (isBlockedAgent) {
        console.log(`🚫 IDM Blocked [User-Agent]: ${req.ip} | ${userAgent}`);
        return res.status(403).json({
            error: 'Access Denied',
            message: 'Download Managers are not allowed. Please use the browser player.'
        });
    }

    // 3. Strict Referer Check
    // Browsers navigating to a page don't always have referer, BUT:
    // This middleware is applied to /api/stream endpoints, which act as sub-resources (fetch/XHR).
    // These MUST have a Referer from the hosting page.
    // Allow localhost and vercel deployments
    if (!referer) {
        console.log(`🚫 IDM Blocked [Missing Referer]: ${req.ip}`);
        return res.status(403).json({
            error: 'Access Denied',
            message: 'Invalid Referer. Direct access is not allowed.'
        });
    }
    // Optional: Add specific domain check if needed
    // const allowedDomains = ['localhost', 'vercel.app', 'your-domain.com'];
    // const isAllowed = allowedDomains.some(d => referer.includes(d));
    // if (!isAllowed) { ... }

    // 4. Block HEAD Requests
    // IDM and others often send a HEAD request first to check file size/type.
    if (req.method === 'HEAD') {
        console.log(`🚫 IDM Blocked [HEAD Request]: ${req.ip}`);
        return res.status(405).end();
    }

    // 5. Browser-Specific Header Validation (Fetch Metadata)
    // Modern browsers send Sec-Fetch-* headers. IDM/Curl often don't.
    const secFetchDest = req.get('Sec-Fetch-Dest');
    const secFetchMode = req.get('Sec-Fetch-Mode');
    const secFetchSite = req.get('Sec-Fetch-Site');

    // Only strictly enforce if these headers are present (to avoid blocking older legitimate browsers, though rare now)
    // However, for high security, we should be suspicious if they are MISSING on a modern stack.
    if (secFetchDest) {
        // Valid destinations for media stream: 'video', 'audio', 'empty' (fetch/xhr for m3u8)
        const validDestinations = ['video', 'audio', 'empty', 'object'];
        if (!validDestinations.includes(secFetchDest)) {
            console.log(`🚫 IDM Blocked [Invalid Sec-Fetch-Dest]: ${secFetchDest}`);
            return res.status(403).json({ error: 'Invalid Request Mode' });
        }
    }

    // 6. Range Request Analysis (Heuristic)
    // Download managers often request multiple small chunks simultaneously.
    // If the User-Agent looks generic but makes aggressive Range requests, we could flag it.
    // For now, we will rely on the headers above.

    next();
};

export default blockIDM;
