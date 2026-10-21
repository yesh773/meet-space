# MeetSpace

A real-time meeting app: **video calls (WebRTC), screen sharing, group chat, a shared whiteboard, and file sharing**.
Built with React, Tailwind, Node/Express, Socket.IO and MongoDB.

## Folder structure

```
meetspace/
├── server/
│   ├── server.js              # Express + Socket.IO setup, middleware, error handler
│   ├── config/db.js           # MongoDB connection
│   ├── models/                # User.js, Room.js, Message.js
│   ├── middleware/            # auth.js (JWT check), asyncHandler.js
│   ├── routes/                # auth.js, rooms.js, files.js (Multer)
│   ├── socket/index.js        # all Socket.IO events (rooms, signaling, chat, whiteboard)
│   ├── uploads/               # uploaded files (git-ignored)
│   └── .env
└── client/
    ├── index.html, vite.config.js, tailwind.config.js, vercel.json
    └── src/
        ├── main.jsx, App.jsx  # router setup
        ├── api.js, socket.js  # fetch wrapper + shared socket instance
        ├── context/AuthContext.jsx
        ├── hooks/useWebRTC.js # ALL the WebRTC logic lives here
        ├── pages/             # Login, Register, Dashboard, Room
        └── components/        # ProtectedRoute, VideoTile, ChatSidebar, Whiteboard
```

## Run it locally

You need Node 18+ and MongoDB (local, or a free Atlas cluster).

```bash
# Terminal 1 - backend
cd server
cp .env  
npm install
npm run dev               # http://localhost:5000

# Terminal 2 - frontend
cd client
cp .env.example .env
npm install
npm run dev               # http://localhost:5174
```

To test video calling: sign up two different users, one in a normal window and one in an incognito window (or another browser). Create a room in one, paste the Room ID in the other.

**Config** is just two `.env` files:

| File | Variable | Meaning |
|---|---|---|
| server/.env | `MONGO_URI` | MongoDB connection string |
| server/.env | `JWT_SECRET` | long random string used to sign tokens |
| server/.env | `CLIENT_URL` | frontend URL (for CORS) |
| client/.env | `VITE_API_URL` | backend URL |

## Database schemas

**User** `{ name, email (unique), password (bcrypt hash, hidden by default), createdAt }`
**Room** `{ roomId (unique 8-char code), name, host -> User, participants [User], createdAt }`
**Message** `{ room (roomId), sender -> User, senderName, text, file { name, filename }, createdAt }`

Whiteboard strokes are *not* stored in MongoDB. They live in server memory per room (see "Limitations").

## REST API

All routes except signup/login need the header `Authorization: Bearer <token>`.

| Method | Endpoint | Body | Success response | Validation |
|---|---|---|---|---|
| POST | `/api/auth/signup` | `{ name, email, password }` | `201 { token, user }` | name 2-50, valid email, password >= 8, email unique (409) |
| POST | `/api/auth/login` | `{ email, password }` | `{ token, user }` | wrong credentials -> 401 |
| POST | `/api/auth/logout` | none | `{ message }` | client deletes its token |
| GET | `/api/auth/me` | none | `{ user }` | requires token |
| POST | `/api/rooms` | `{ name }` | `201 { room }` | name 1-60 chars |
| POST | `/api/rooms/:roomId/join` | none | `{ room, messages }` (last 100) | 404 if room doesn't exist |
| POST | `/api/files` | multipart, field `file` | `201 { name, filename }` | max 10MB, extension whitelist |
| GET | `/uploads/:filename` | none | file download | random 32-char filename |

## Socket.IO events

The socket handshake sends the JWT (`auth: { token }`) and the server rejects invalid tokens.

| Event | Direction | Payload | What happens |
|---|---|---|---|
| `join-room` | client -> server | `{ roomId }` | joins the Socket.IO room, then server replies with `room-users` and `whiteboard-history` |
| `room-users` | server -> client | `[{ socketId, name }]` | people already in the room (the new user calls them) |
| `user-joined` / `user-left` | server -> room | `{ socketId, name }` | presence updates |
| `leave-room` | client -> server | none | also runs automatically on disconnect |
| `webrtc-offer` / `webrtc-answer` | both ways | `{ to, offer }` / `{ to, answer }` | server forwards, adding `from` |
| `ice-candidate` | both ways | `{ to, candidate }` | server forwards, adding `from` |
| `send-message` | client -> server | `{ text }` or `{ file: { name, filename } }` | saves to MongoDB |
| `receive-message` | server -> room | the saved message | shown in everyone's chat |
| `whiteboard-draw` | both ways | `{ x0, y0, x1, y1, color }` (0-1 coords) | broadcast to others, saved in memory |
| `whiteboard-clear` | both ways | none | clears for everyone |
| `screen-share-started` / `-stopped` | both ways | none / `{ name }` | shows "X is presenting" |

## How WebRTC works here

WebRTC sends video **directly between browsers**. But browsers first need to exchange a few messages to find each other. This is called **signaling**, and our Socket.IO server does it. The server never touches the video.

When **Alice** is already in a room and **Bob** joins:

```
Bob                    Server                  Alice
 | -- join-room ------->|                        |
 |<-- room-users [Alice]|                        |
 |  (create peer, createOffer, setLocalDescription)
 | -- webrtc-offer ---->| ---- webrtc-offer ---->|
 |                      |  (setRemoteDescription, createAnswer, setLocalDescription)
 |<---- webrtc-answer --| <---- webrtc-answer ---|
 |<=== ice-candidate ==>|<==== ice-candidate ===>|   (many, in both directions)
 |<================ video/audio flows directly ===============>|
```

1. **Peer connection setup** - `new RTCPeerConnection()` per other person. We add our mic and camera tracks with `addTrack`.
2. **Offer** - the newcomer creates an offer (a description of what media they can send/receive) and sends it.
3. **Answer** - the existing user sets the offer as their remote description, creates an answer, and sends it back.
4. **ICE candidates** - each browser discovers possible network routes (its local IP, public IP via the STUN server...) and sends each one to the other side. When a working pair is found, media starts flowing.
5. **Screen sharing** - `getDisplayMedia()` gives a screen video track. We call `sender.replaceTrack(screenTrack)` on every connection, so no new offer/answer is needed. Stopping swaps the camera track back.

This is a **mesh** setup: everyone connects to everyone. It's simple and great for a portfolio, but works well only for about 4-6 people (each person uploads their video N-1 times).

## UI overview

- **Login / Register** - centered card forms with error messages
- **Dashboard** - "Start a new meeting", "Join with room ID", and a profile card
- **Meeting room** - responsive video grid (left), chat sidebar (right), control bar (mute, camera, share screen, whiteboard toggle, leave)
- **Whiteboard panel** - color swatches, clear button, canvas (swaps with the video grid)

## Implementation roadmap

Do these in order. Each step ends with something you can test.

1. **Authentication** (1-2 days) - User model, signup/login/me routes, AuthContext, ProtectedRoute. *Test: sign up, refresh the page, still logged in.*
2. **Room creation** (1 day) - Room model, create/join routes, Dashboard. *Test: create a room, see its ID.*
3. **Socket.IO chat** (1-2 days) - JWT socket middleware, `join-room`, `send-message`, ChatSidebar, Message model. *Test: two browsers chatting; refresh and history is still there.*
4. **Video calling** (3-4 days, the hardest) - `useWebRTC` hook. Start with 2 people, then add more. Add mute/camera. *Test: two browser windows see each other.*
5. **Screen sharing** (1 day) - `getDisplayMedia` + `replaceTrack`. *Test: other window shows your screen.*
6. **Whiteboard** (1-2 days) - canvas drawing locally first, then add socket events, then history for late joiners. *Test: draw in one window, see it in the other.*
7. **File sharing** (1 day) - Multer route, attach button, download link in chat. *Test: upload a PDF and download it from the other window.*
8. **Deployment** (1 day) - see below.

## Deployment (all free tiers)

### 1. MongoDB Atlas
1. Create a free M0 cluster, then a database user.
2. Network Access -> allow `0.0.0.0/0` (Render's IPs change).
3. Copy the connection string (replace `<password>`), add a database name like `/meetspace`.

### 2. Backend on Render
1. Push the repo to GitHub. On Render: **New -> Web Service**, choose the repo.
2. Root directory `server`, build command `npm install`, start command `npm start`.
3. Environment variables: `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL` (your Vercel URL, no trailing slash).
4. Check `https://your-app.onrender.com/api/health` returns `{"ok":true}`.

### 3. Frontend on Vercel
1. **New Project**, choose the repo, set root directory to `client` (framework: Vite).
2. Environment variable: `VITE_API_URL=https://your-app.onrender.com`
3. Deploy. Then go back to Render and make sure `CLIENT_URL` matches the Vercel URL exactly.

Camera access needs HTTPS, which Vercel and Render both provide.

## Security checklist (what's already done)

- Passwords hashed with bcrypt, never returned by the API
- JWT checked on REST routes **and** on the socket connection
- Input validation on every route and socket event; sizes capped
- Chat messages rendered by React (auto-escaped, so no XSS); file links built from validated filenames only
- Uploads: extension whitelist, 10MB limit, random filenames, served with `Content-Disposition: attachment`
- `helmet`, CORS limited to your frontend, rate limit on login/signup
- Servers only relay WebRTC messages between people in the same room

## Known limitations (good "next steps" / interview talking points)

- **Mesh WebRTC** - fine for ~4-6 people. For bigger rooms you'd use an SFU like LiveKit or mediasoup.
- **No TURN server** - about 10-15% of users (strict corporate networks) can't connect with STUN only. Fix: add a TURN service (Metered, Twilio, or self-hosted coturn) to `ICE_CONFIG` in `useWebRTC.js`.
- **Render's free disk is temporary** - uploaded files vanish on redeploy. Fix: swap Multer's disk storage for S3 or Cloudinary.
- **Token in localStorage** - simple, but readable by JavaScript if you ever have an XSS bug. A more secure option is an HTTP-only cookie.
- **Whiteboard history is in memory** - lost on server restart, and it only works with one server instance. Fix: save to MongoDB, or use the Socket.IO Redis adapter.
- **Render free tier sleeps** after 15 minutes idle, so the first request can take ~30s.
- Ideas to add: roles (host can remove people), read receipts, emoji reactions, whiteboard undo, a Dockerfile, tests.
