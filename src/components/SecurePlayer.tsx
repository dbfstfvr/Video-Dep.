import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import Hls from 'hls.js';
import axios from 'axios';

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

    // 1. Session Negotiation
    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(null);
        setProxiedUrl(null);

        const setupSecureSession = async () => {
            try {
                // Initial Handshake to set Session Cookie
                // Ensure 'withCredentials' is true so the browser stores the cookie for our backend domain
                const response = await axios.post(`${BACKEND_URL}/api/init-session`, {}, {
                    withCredentials: true
                });

                if (response.data.success) {
                    // Point to our secure proxy
                    // The <video> tag will send the 'connect.sid' cookie automatically with this GET request
                    const secureUrl = `${BACKEND_URL}/api/stream?url=${encodeURIComponent(url)}`;
                    if (isMounted) setProxiedUrl(secureUrl);
                } else {
                    throw new Error("Session refused");
                }
            } catch (err: any) {
                console.error("Session Error:", err);
                if (isMounted) {
                    setError("Security negotiation failed. Please enable cookies and disable download managers.");
                    setLoading(false);
                }
            }
        };

        setupSecureSession();

        return () => { isMounted = false; };
    }, [url, BACKEND_URL]);

    // 2. Player Initialization (Once Proxy URL is ready)
    useEffect(() => {
        if (!proxiedUrl) return;

        let isMounted = true;

        const isHls = url.includes('.m3u8');

        if (type === 'video' && isHls) {
            // HLS with Session Cookies
            if (Hls.isSupported()) {
                const hls = new Hls({
                    xhrSetup: (xhr) => {
                        xhr.withCredentials = true; // CRITICAL: Send Session Cookie for segments
                    }
                });

                if (videoRef.current) {
                    hls.loadSource(proxiedUrl);
                    hls.attachMedia(videoRef.current);
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        if (isMounted) setLoading(false);
                    });
                    hls.on(Hls.Events.ERROR, (_, data) => {
                        if (data.fatal && isMounted) setError("Stream loading failed");
                    });
                }

                return () => {
                    hls.destroy();
                };
            } else if (videoRef.current && videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS (Safari handles cookies automatically)
                videoRef.current.src = proxiedUrl;
                videoRef.current.addEventListener('loadedmetadata', () => {
                    if (isMounted) setLoading(false);
                });
            }
        } else {
            // Standard MP4/Audio
            if (isMounted) setLoading(false);
        }

    }, [proxiedUrl, type, url]);

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
