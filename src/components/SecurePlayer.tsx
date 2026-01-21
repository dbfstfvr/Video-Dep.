import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Hls from 'hls.js';

interface SecurePlayerProps {
    url: string;
    type: 'video' | 'audio';
    title: string;
}

export const SecurePlayer: React.FC<SecurePlayerProps> = ({ url, type, title }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Watermark Animation State
    const [watermarkPos, setWatermarkPos] = useState({ top: '10%', left: '10%' });
    const [isWindowHidden, setIsWindowHidden] = useState(false);

    const [proxiedUrl, setProxiedUrl] = useState<string | null>(null);
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(null);
        setProxiedUrl(null);

        const setupSecureStream = async () => {
            try {
                // 1. Get Security Token from our Backend
                const tokenRes = await fetch(`${BACKEND_URL}/api/generate-token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!tokenRes.ok) throw new Error("Failed to secure stream session");

                const { token } = await tokenRes.json();

                // 2. Construct Proxy URL
                // The backend will fetch the `url` (Hostinger) and pipe it to us,
                // while enforcing IDM blocking (Referer/User-Agent checks).
                const secureStreamUrl = `${BACKEND_URL}/api/stream?token=${token}&url=${encodeURIComponent(url)}`;
                setProxiedUrl(secureStreamUrl);

                // 3. Initialize Player
                const isHls = url.includes('.m3u8');

                if (type === 'video' && isHls) {
                    if (Hls.isSupported()) {
                        const hls = new Hls({
                            xhrSetup: () => {
                                // Optional: Custom headers if backend needs them
                            }
                        });

                        if (videoRef.current) {
                            hls.loadSource(secureStreamUrl);
                            hls.attachMedia(videoRef.current);
                            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                                if (isMounted) setLoading(false);
                            });
                            hls.on(Hls.Events.ERROR, (_, data) => {
                                console.error("HLS Error:", data);
                                if (data.fatal && isMounted) setError("Stream loading failed");
                            });
                        }
                    } else if (videoRef.current && videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
                        // Native HLS (Safari)
                        videoRef.current.src = secureStreamUrl;
                        videoRef.current.addEventListener('loadedmetadata', () => {
                            if (isMounted) setLoading(false);
                        });
                    }
                } else {
                    // Standard MP4/Audio Fallback via Proxy
                    if (isMounted) setLoading(false);
                }

            } catch (err) {
                console.error("Secure Setup Failed:", err);
                if (isMounted) {
                    setError("Security negotiation failed. Please disable ad-blockers/IDM.");
                    setLoading(false);
                }
            }
        };

        setupSecureStream();

        return () => {
            isMounted = false;
        };
    }, [url, type]);

    // Dynamic Watermark Animation
    useEffect(() => {
        const interval = setInterval(() => {
            // Random position every 4 seconds
            const top = Math.floor(Math.random() * 80) + 10; // 10% to 90%
            const left = Math.floor(Math.random() * 80) + 10;
            setWatermarkPos({ top: `${top}%`, left: `${left}%` });
        }, 4000);

        return () => clearInterval(interval);
    }, []);

    // -------------------------------------------
    // 🛡️ ANTI-RECORDING: INACTIVITY GUARD
    // -------------------------------------------
    const [isIdle, setIsIdle] = useState(false);
    const idleTimerRef = useRef<number | null>(null);
    const IDLE_TIMEOUT = 20000; // 20 seconds

    const resetIdleTimer = () => {
        if (isIdle) {
            setIsIdle(false);
        }

        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

        idleTimerRef.current = window.setTimeout(() => {
            setIsIdle(true);
            if (videoRef.current) {
                videoRef.current.pause(); // Pause video
            }
        }, IDLE_TIMEOUT);
    };

    useEffect(() => {
        // Track user activity
        const activities = ['mousemove', 'keydown', 'click', 'scroll'];
        activities.forEach(event => window.addEventListener(event, resetIdleTimer));

        resetIdleTimer(); // Start timer

        return () => {
            activities.forEach(event => window.removeEventListener(event, resetIdleTimer));
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, [isIdle]);
    // -------------------------------------------

    useEffect(() => {
        const handleVisibilityChange = () => {
            const isHidden = document.hidden;
            setIsWindowHidden(isHidden);

            if (isHidden && containerRef.current) {
                // IMMEDIATE ACTION: Pause media
                const media = containerRef.current.querySelector('video, audio') as HTMLMediaElement;
                if (media) {
                    media.pause();
                }
            }
        };

        const handleKeydown = (e: KeyboardEvent) => {
            // Block PrintScreen and common recording shortcuts
            if (e.key === 'PrintScreen' || (e.ctrlKey && e.shiftKey && e.key === 'I')) {
                // Nuke the display temporarily
                setIsWindowHidden(true);
                setTimeout(() => setIsWindowHidden(false), 2000); // Blink effect
                e.preventDefault();
                alert("Screenshots are not allowed.");
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("keydown", handleKeydown);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("keydown", handleKeydown);
        };
    }, []);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                width: '100%',
                background: '#000',
                borderRadius: '8px',
                overflow: 'hidden',
                userSelect: 'none', // Prevent selection
                WebkitUserSelect: 'none',
            }}
            onContextMenu={(e) => e.preventDefault()} // Disable Right Click
        >

            {loading && (
                <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center', color: '#666' }}>
                    <Loader2 className="animate-spin" />
                </div>
            )}

            {!loading && proxiedUrl && (
                <>
                    {type === 'video' ? (
                        <video
                            ref={videoRef}
                            src={!url.includes('.m3u8') ? proxiedUrl : undefined}
                            controls
                            controlsList="nodownload noremoteplayback" // Security: Block download UI
                            disablePictureInPicture // Security: Prevent PiP which might bypass overlay
                            style={{ width: '100%', display: 'block' }}
                        />
                    ) : (
                        <audio
                            src={proxiedUrl}
                            controls
                            controlsList="nodownload"
                            style={{ width: '100%', display: 'block', padding: '10px' }}
                        />
                    )}

                    {/* DYNAMIC WATERMARK OVERLAY */}
                    {type === 'video' && (
                        <div
                            style={{
                                position: 'absolute',
                                top: watermarkPos.top,
                                left: watermarkPos.left,
                                color: 'rgba(255, 255, 255, 0.3)',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                pointerEvents: 'none', // Allow clicks to pass through
                                zIndex: 10,
                                transition: 'all 2s ease-in-out', // Smooth movement
                                textShadow: '0px 0px 4px rgba(0,0,0,0.8)',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            Do Not Record - {title.substring(0, 15)}...
                        </div>
                    )}

                    {/* INVISIBLE OVERLAY TO BLOCK RIGHT CLICK ON VIDEO ITSELF */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            zIndex: 5,
                            pointerEvents: 'none' // Crucial: allows controls to work, but blocks direct context menu on video area
                        }}
                    />

                    {/* SCREEN RECORDING PROTECTION OVERLAY (Appears on focus loss OR Inactivity) */}
                    {(isWindowHidden || isIdle) && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            background: 'black',
                            zIndex: 100,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            flexDirection: 'column'
                        }}>
                            <AlertTriangle size={48} color="red" />
                            <h3>Playback Paused</h3>
                            <p>Please keep this window active to watch.</p>
                        </div>
                    )}
                </>
            )}

            {error && (
                <div style={{ padding: '2rem', color: '#ff6b6b', textAlign: 'center' }}>
                    <AlertTriangle size={20} /> <br />
                    {error}
                </div>
            )}
        </div>
    );
};
