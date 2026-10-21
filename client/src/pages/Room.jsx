import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import socket from '../socket.js';
import useWebRTC from '../hooks/useWebRTC.js';
import VideoTile from '../components/VideoTile.jsx';
import ChatSidebar from '../components/ChatSidebar.jsx';
import Whiteboard from '../components/Whiteboard.jsx';

// Step 1: ask the server if the room exists (and load old messages). Step 2: render the meeting.
export default function Room() {
  const { roomId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/rooms/${roomId}/join`, { method: 'POST' }).then(setData).catch((e) => setError(e.message));
  }, [roomId]);

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-red-600">{error}</p>
        <Link to="/" className="text-indigo-600 underline">Back to dashboard</Link>
      </div>
    );
  }
  if (!data) return <p className="p-8 text-center text-gray-500">Joining room...</p>;
  return <Meeting room={data.room} initialMessages={data.messages} />;
}

function Meeting({ room, initialMessages }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const rtc = useWebRTC(room.roomId);
  const [messages, setMessages] = useState(initialMessages);
  const [view, setView] = useState('video'); // 'video' | 'board'

  useEffect(() => {
    const onMessage = (m) => setMessages((prev) => [...prev, m]);
    socket.on('receive-message', onMessage);
    return () => socket.off('receive-message', onMessage);
  }, []);

  const sendMessage = (payload) => socket.emit('send-message', payload);
  const participantCount = 1 + Object.keys(rtc.remotes).length;

  const controlBtn = (active) =>
    `rounded-lg px-4 py-2 text-sm font-medium ${active ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-red-500 text-white hover:bg-red-600'}`;

  return (
    <div className="grid h-screen grid-cols-1 grid-rows-[1fr_300px] bg-gray-900 md:grid-cols-[1fr_320px] md:grid-rows-1">
      {/* Left: video / whiteboard + controls */}
      <div className="flex min-h-0 flex-col">
        <header className="flex items-center justify-between px-4 py-3 text-white">
          <div>
            <h1 className="font-semibold">{room.name}</h1>
            <button onClick={() => navigator.clipboard.writeText(room.roomId)} className="text-xs text-gray-400 hover:text-white">
              Room ID: {room.roomId} (click to copy) · {participantCount} in call
            </button>
          </div>
          {rtc.presenter && <span className="rounded bg-indigo-600 px-3 py-1 text-xs">{rtc.presenter} is presenting</span>}
        </header>

        {rtc.error && <p className="mx-4 rounded bg-red-100 p-2 text-sm text-red-700">{rtc.error}</p>}

        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* Both stay mounted (just hidden) so audio keeps playing while the whiteboard is open */}
          <div className={view === 'video' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'hidden'}>
            <VideoTile stream={rtc.localStream} name={`${user.name} (You)`} muted />
            {Object.entries(rtc.remotes).map(([id, r]) => (
              <VideoTile key={id} stream={r.stream} name={r.name} />
            ))}
          </div>
          <div className={view === 'board' ? 'block' : 'hidden'}>
            <Whiteboard />
          </div>
        </main>

        <footer className="flex flex-wrap items-center justify-center gap-2 p-3">
          <button onClick={rtc.toggleMic} className={controlBtn(rtc.micOn)}>{rtc.micOn ? 'Mute' : 'Unmute'}</button>
          <button onClick={rtc.toggleCam} className={controlBtn(rtc.camOn)}>{rtc.camOn ? 'Camera off' : 'Camera on'}</button>
          <button onClick={rtc.sharing ? rtc.stopShare : rtc.startShare} className={controlBtn(!rtc.sharing)}>
            {rtc.sharing ? 'Stop sharing' : 'Share screen'}
          </button>
          <button onClick={() => setView(view === 'video' ? 'board' : 'video')} className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600">
            {view === 'video' ? 'Whiteboard' : 'Back to video'}
          </button>
          <button onClick={() => navigate('/')} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Leave</button>
        </footer>
      </div>

      {/* Right: chat */}
      <div className="min-h-0">
        <ChatSidebar messages={messages} userId={user.id} onSend={sendMessage} />
      </div>
    </div>
  );
}
