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
    const allowedDomain = 'localhost'; // Change this to your domain in production
    if (!referer || !referer.includes(allowedDomain)) {
        console.log(`🚫 IDM Blocked [Missing/Invalid Referer]: ${req.ip} | Referer: ${referer || 'None'}`);
        return res.status(403).json({
            error: 'Access Denied',
            message: 'Invalid Referer. Direct access is not allowed.'
        });
    }

    // 4. Block HEAD Requests
    // IDM and others often send a HEAD request first to check file size/type.
    if (req.method === 'HEAD') {
        console.log(`🚫 IDM Blocked [HEAD Request]: ${req.ip}`);
        return res.status(405).end();
    }

    next();
};

export default blockIDM;
