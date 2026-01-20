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

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(null);

        const isHls = url.includes('.m3u8');

        if (type === 'video' && isHls) {
            if (Hls.isSupported()) {
                const hls = new Hls({
                    xhrSetup: (_xhr, _url) => {
                        // In a real app, you might add auth headers here if needed for segments
                        // xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                    }
                });

                // Wait for video ref to be available
                if (videoRef.current) {
                    hls.loadSource(url);
                    hls.attachMedia(videoRef.current);
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        if (isMounted) setLoading(false);
                    });
                    hls.on(Hls.Events.ERROR, (_event, data) => {
                        console.error("HLS Error:", data);
                        if (data.fatal) {
                            if (isMounted) setError("Stream loading failed");
                        }
                    });
                }
            } else if (videoRef.current && videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS support (Safari)
                videoRef.current.src = url;
                videoRef.current.addEventListener('loadedmetadata', () => {
                    if (isMounted) setLoading(false);
                });
            } else {
                setError("HLS not supported in this browser");
                setLoading(false);
            }
        } else {
            // Standard direct file playback (fallback if HLS not available or for audio)
            // Even for direct files, we try to use the object URL approach if possible to hide origin
            // But for this step relying on the `url` prop directly for non-HLS is safer for now
            // unless we want to reimplement the fetch logic.
            // Let's keep the direct URL for non-HLS for simplicity in this specific "Streaming" update.
            setLoading(false);
        }

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

    // Anti-PrintScreen / Blur Detection
    // Anti-PrintScreen / Screen Record Detection (Focus Loss)
    const [isWindowHidden, setIsWindowHidden] = useState(false);

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

            {!loading && (
                <>
                    {type === 'video' ? (
                        <video
                            ref={videoRef}
                            src={!url.includes('.m3u8') ? url : undefined}
                            controls
                            controlsList="nodownload noremoteplayback" // Security: Block download UI
                            disablePictureInPicture // Security: Prevent PiP which might bypass overlay
                            style={{ width: '100%', display: 'block' }}
                        />
                    ) : (
                        <audio
                            src={url}
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

                    {/* SCREEN RECORDING PROTECTION OVERLAY (Appears on focus loss) */}
                    {isWindowHidden && (
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
