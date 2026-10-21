import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState('');
  const [joinId, setJoinId] = useState('');
  const [error, setError] = useState('');

  const createRoom = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { room } = await api('/api/rooms', { method: 'POST', body: { name: roomName } });
      navigate(`/room/${room.roomId}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const joinRoom = (e) => {
    e.preventDefault();
    if (joinId.trim()) navigate(`/room/${joinId.trim()}`);
  };

  return (
    <div className="mx-auto max-w-4xl p-4">
      <header className="flex items-center justify-between py-4">
        <h1 className="text-2xl font-bold text-indigo-600">MeetSpace</h1>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-900">Log out</button>
      </header>

      {error && <p className="mb-4 rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={createRoom} className="card space-y-3">
          <h2 className="text-lg font-semibold">Start a new meeting</h2>
          <input className="input" placeholder="Meeting name" required maxLength={60}
            value={roomName} onChange={(e) => setRoomName(e.target.value)} />
          <button className="btn w-full">Create room</button>
        </form>

        <form onSubmit={joinRoom} className="card space-y-3">
          <h2 className="text-lg font-semibold">Join with a room ID</h2>
          <input className="input" placeholder="e.g. a3f9c21b" required
            value={joinId} onChange={(e) => setJoinId(e.target.value)} />
          <button className="btn w-full">Join room</button>
        </form>

        <div className="card md:col-span-2">
          <h2 className="mb-2 text-lg font-semibold">Your profile</h2>
          <p className="text-sm text-gray-600">Name: <span className="font-medium text-gray-900">{user.name}</span></p>
          <p className="text-sm text-gray-600">Email: <span className="font-medium text-gray-900">{user.email}</span></p>
        </div>
      </div>
    </div>
  );
}
