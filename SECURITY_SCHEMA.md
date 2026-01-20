# 🔐 Anti-Download Schema (IDM & Third-Party Protection)

## 🎯 Objective
Ensure that video/audio cannot be downloaded by:
- Internet Download Manager (IDM)
- Browser download extensions
- Direct URL access

## 🏗️ Core Protection Architecture
```mermaid
graph TD
    User[User Browser]
    Auth[Auth Token + Session]
    Player[React Secure Player]
    API[Backend Authorization API]
    Stream[Streaming Server (HLS)]
    Storage[Private Storage]

    User -->|Auth Token + Session| Player
    Player -->|Request Stream Permission| API
    API -->|Generate Temporary Signed URL| Stream
    Stream -->|Encrypted Media Segments| Player
    Stream --> Storage
```

## 1️⃣ Block Direct File Access (Most Important)
**Rule:**
- ❌ **Never** expose `.mp4`, `.mp3` public URLs
- ✔ Store media in private directory

```
/storage/private/videos/*
/storage/private/audios/*
```
Access only through backend.

## 2️⃣ Use Streaming (HLS) Instead of Direct MP4
Instead of:
`video.mp4` ❌ (IDM downloads easily)

Use:
```
index.m3u8   → seg1.ts
            → seg2.ts
            → seg3.ts
```
- ✔ IDM cannot combine segments easily
- ✔ No single downloadable file

## 3️⃣ Token-Based Temporary URLs
**Flow:**
1. User clicks Play
2. React requests stream token
3. Backend validates user
4. Backend generates TEMP URL (2–5 min)
5. React loads stream

**Example:**
`/stream/video/abc123?token=eyJhbGciOi...`

- ✔ URL expires
- ✔ Sharing URL useless

## 4️⃣ Block IDM & Downloader Headers
**Server-Side Filter**
Detect and block:
- `User-Agent`: IDM, wget, curl, aria2
- Missing browser headers

**Flow:**
1. Request Received
2. Check Headers
3. If Downloader Detected → **403 Forbidden**
4. Else → Allow Streaming

## 5️⃣ Referer / Origin Validation
Only allow requests from:
`https://yourdomain.com`

Block:
- Direct URL open in browser
- IDM requests

## 6️⃣ Disable Browser Download Options (Frontend)
In React Player:
- Disable:
    - Right click
    - Download button
    - ControlsList

**Concept:**
```jsx
<video
  controls
  controlsList="nodownload noremoteplayback"
  disablePictureInPicture
/>
```
- ✔ Removes browser download option
- ✔ Blocks basic save

## 7️⃣ Segment Encryption (Strong Protection)
Each HLS segment is:
- Encrypted (`.ts`)
- Key protected by backend

**Flow:**
1. Player requests key
2. Backend validates token
3. Sends key

- ✔ IDM cannot decrypt
- ✔ Even if downloaded → useless

## 8️⃣ Rate Limiting & Connection Control
**Rules:**
- Max requests per IP
- Max parallel connections

**Purpose:**
- Prevent segment mass-download
- Detect abnormal behavior

## 🔄 Complete Secure Playback Flow
1. **[User Login]**
2. **[React Player]** → request permission
3. **[Backend API]** → validate + token
4. **[Signed Stream URL]**
5. **[HLS Playlist]**
6. **[Encrypted Segments]**
7. **[Playback Only]**
