import { useEffect, useRef, useState } from 'react';
import { API_URL, uploadFile } from '../api.js';

const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function ChatSidebar({ messages, userId, onSend }) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const fileInput = useRef(null);

  // Always scroll to the newest message
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend({ text });
    setText('');
  };

  // Upload via REST, then share the result in chat via the socket
  const handleFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const { name, filename } = await uploadFile(file);
      onSend({ file: { name, filename } });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <aside className="flex h-full flex-col border-l border-gray-200 bg-white">
      <h2 className="border-b p-3 font-semibold">Chat</h2>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((m) => {
          const mine = m.sender === userId;
          return (
            <div key={m._id} className={mine ? 'text-right' : ''}>
              <p className="text-xs text-gray-400">{mine ? 'You' : m.senderName} · {formatTime(m.createdAt)}</p>
              <div className={`inline-block max-w-[85%] break-words rounded-lg px-3 py-2 text-left text-sm ${mine ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>
                {m.text}
                {m.file && (
                  <a href={`${API_URL}/uploads/${m.file.filename}`} target="_blank" rel="noreferrer"
                    className={`block underline ${mine ? 'text-indigo-100' : 'text-indigo-600'}`}>
                    Download: {m.file.name}
                  </a>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-3 text-xs text-red-600">{error}</p>}
      <form onSubmit={handleSubmit} className="flex gap-2 border-t p-3">
        <input ref={fileInput} type="file" hidden onChange={handleFile} />
        <button type="button" onClick={() => fileInput.current.click()} disabled={uploading}
          className="rounded-lg border px-3 text-sm hover:bg-gray-50" title="Attach a file (max 10MB)">
          {uploading ? '...' : 'Attach'}
        </button>
        <input className="input" placeholder="Type a message" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn">Send</button>
      </form>
    </aside>
  );
}
