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
        'DownloadAccelerator'
    ];

    // 2. Check if User-Agent matches any blocked signature
    const isBlockedAgent = blockedAgents.some(agent =>
        userAgent.toLowerCase().includes(agent.toLowerCase())
    );

    // 3. Strict Referer Check (Optional but recommended for media)
    // In production, ensure this matches your actual domain
    const allowedDomain = 'localhost'; // Change this to your domain e.g. 'yoursite.com'
    const isInvalidReferer = !referer || !referer.includes(allowedDomain);

    // NOTE: IDM often sends requests with NO Referer or a fake one.
    // If you are serving an API/Stream, a missing referer is highly suspicious for a browser request.

    if (isBlockedAgent) {
        console.log(`🚫 IDM Blocked! IP: ${req.ip} | Agent: ${userAgent}`);
        return res.status(403).json({
            error: 'Access Denied',
            message: 'Download Managers are not allowed. Please use the browser player.'
        });
    }

    // 4. (Advanced) Thread/Connection Limiting - Conceptual
    // If you see 10+ connections from same IP for same file in 1 second, it's IDM.
    // This requires a shared state (Redis/Memory) not merely this middleware.

    next();
};

export default blockIDM;
