import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Upload, FileVideo, FileAudio, AlertCircle } from 'lucide-react';
import { supabase } from './supabaseClient';
import { SecurePlayer } from './components/SecurePlayer';

// API Configuration
const UPLOAD_API_URL = 'https://darkgoldenrod-lyrebird-210481.hostingersite.com/api.php';

interface VideoRecord {
    id: string;
    title: string;
    encrypted_path: string; // Storing the full URL here for simplicity
    created_at: string;
    access_level: string;
}

function App() {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    // Database State
    const [videos, setVideos] = useState<VideoRecord[]>([]);
    const [loadingVideos, setLoadingVideos] = useState(true);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // 1. Fetch Videos from Supabase on Load
    useEffect(() => {
        fetchVideos();
    }, []);

    const fetchVideos = async () => {
        try {
            const { data, error } = await supabase
                .from('videos')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setVideos(data || []);
        } catch (err: any) {
            console.error('Error fetching videos:', err.message);
        } finally {
            setLoadingVideos(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError(null);
            setProgress(0);
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setUploading(true);
        setError(null);
        setProgress(0);

        const formData = new FormData();
        formData.append('file', file);

        try {
            // 2. Upload to Hostinger API
            const response = await axios.post(UPLOAD_API_URL, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.total) {
                        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        setProgress(percent);
                    }
                },
            });

            if (response.data.success) {
                const fileUrl = `${UPLOAD_API_URL}?filename=${response.data.filename}`;

                // 3. Save Metadata to Supabase
                const { error: dbError } = await supabase
                    .from('videos')
                    .insert([
                        {
                            title: file.name,
                            description: `Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB`,
                            encrypted_path: fileUrl, // Storing the playback URL
                            access_level: 'public',
                            duration: 0 // Placeholder
                        }
                    ]);

                if (dbError) throw dbError;

                // Success! Refresh list
                setFile(null);
                fetchVideos();
            } else {
                setError(response.data.message || 'Upload failed');
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to upload file');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'left', paddingBottom: '3rem' }}>
            <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
                <h1 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                    <Upload size={32} /> Hostinger
                </h1>
                <p style={{ color: '#888' }}>Upload your Video/Audio here</p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>

                {/* Left Column: Uploader */}
                <div>
                    <div style={{
                        background: '#333',
                        padding: '2rem',
                        borderRadius: '16px',
                        border: '1px solid #444',
                        position: 'sticky',
                        top: '2rem'
                    }}>
                        <h2 style={{ marginTop: 0, fontSize: '1.2rem', marginBottom: '1rem' }}>Upload New Media</h2>

                        <div style={{
                            border: '2px dashed #555',
                            borderRadius: '12px',
                            padding: '2rem',
                            textAlign: 'center',
                            cursor: 'pointer',
                            marginBottom: '1.5rem',
                            transition: 'all 0.3s ease'
                        }}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept="video/*,audio/*"
                                style={{ display: 'none' }}
                            />

                            {file ? (
                                <div>
                                    {file.type.startsWith('video') ? <FileVideo size={48} color="#646cff" /> : <FileAudio size={48} color="#646cff" />}
                                    <h3 style={{ margin: '10px 0', wordBreak: 'break-all' }}>{file.name}</h3>
                                    <p style={{ color: '#aaa', fontSize: '0.9rem' }}>
                                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <Upload size={48} color="#888" />
                                    <h3>Click to Select File</h3>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleUpload}
                            disabled={!file || uploading}
                            style={{ width: '100%', padding: '0.8rem' }}
                        >
                            {uploading ? 'Uploading...' : 'Final Upload'}
                        </button>

                        {uploading && (
                            <div style={{ marginTop: '1rem' }}>
                                <div style={{ height: '6px', background: '#444', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', background: '#646cff', width: `${progress}%`, transition: 'width 0.2s' }}></div>
                                </div>
                                <p style={{ textAlign: 'right', fontSize: '0.8rem', marginTop: '5px' }}>{progress}%</p>
                            </div>
                        )}

                        {error && (
                            <div style={{ marginTop: '1rem', color: '#ff6b6b', display: 'flex', gap: '8px', alignItems: 'center', background: 'rgba(255,0,0,0.1)', padding: '0.8rem', borderRadius: '8px' }}>
                                <AlertCircle size={18} /> {error}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Database List */}
                <div>
                    <h2 style={{ marginTop: 0, fontSize: '1.2rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span>List of Uploaded media</span>
                        <span style={{ fontSize: '0.9rem', color: '#888', fontWeight: 'normal' }}>{videos.length} items</span>
                    </h2>

                    {loadingVideos ? (
                        <p style={{ color: '#888' }}>Loading from Supabase...</p>
                    ) : videos.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', background: '#333', borderRadius: '12px', color: '#888' }}>
                            <p>No videos found in database.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {videos.map((vid) => (
                                <div key={vid.id} style={{
                                    background: '#2a2a2a',
                                    borderRadius: '12px',
                                    overflow: 'hidden',
                                    border: '1px solid #333'
                                }}>
                                    {/* Media Preview */}
                                    <div style={{ background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
                                        <SecurePlayer
                                            url={vid.encrypted_path}
                                            type={vid.title.match(/\.(mp3|wav|ogg|m4a)$/i) ? 'audio' : 'video'}
                                            title={vid.title}
                                        />
                                    </div>

                                    <div style={{ padding: '1rem' }}>
                                        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', wordBreak: 'break-word' }}>
                                            {vid.title}
                                        </h3>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#888' }}>
                                            <span>{new Date(vid.created_at).toLocaleDateString()}</span>
                                            {/* Direct link removed */}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </div>
    )
}

export default App
