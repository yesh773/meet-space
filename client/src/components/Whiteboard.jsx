import { useEffect, useRef, useState } from 'react';
import socket from '../socket.js';

const COLORS = ['#000000', '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7'];

/*
  We send line segments with coordinates between 0 and 1 (a fraction of the canvas size).
  That way the drawing looks the same on every screen size.
*/
export default function Whiteboard() {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [color, setColor] = useState('#000000');

  const drawLine = (s) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x0 * canvas.width, s.y0 * canvas.height);
    ctx.lineTo(s.x1 * canvas.width, s.y1 * canvas.height);
    ctx.stroke();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  };

  // Listen for other people's drawing
  useEffect(() => {
    const onHistory = (segments) => { clearCanvas(); segments.forEach(drawLine); };
    socket.on('whiteboard-draw', drawLine);
    socket.on('whiteboard-clear', clearCanvas);
    socket.on('whiteboard-history', onHistory);
    return () => {
      socket.off('whiteboard-draw', drawLine);
      socket.off('whiteboard-clear', clearCanvas);
      socket.off('whiteboard-history', onHistory);
    };
  }, []);

  // Mouse position as a 0-1 fraction of the canvas
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const handleDown = (e) => { drawing.current = true; last.current = getPos(e); };
  const handleMove = (e) => {
    if (!drawing.current) return;
    const p = getPos(e);
    const segment = { x0: last.current.x, y0: last.current.y, x1: p.x, y1: p.y, color };
    drawLine(segment);                      // draw locally right away
    socket.emit('whiteboard-draw', segment); // and tell everyone else
    last.current = p;
  };
  const handleUp = () => { drawing.current = false; };

  const handleClear = () => { clearCanvas(); socket.emit('whiteboard-clear'); };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        {COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} style={{ backgroundColor: c }}
            className={`h-7 w-7 rounded-full border-2 ${color === c ? 'border-indigo-500 ring-2 ring-indigo-300' : 'border-white'}`} />
        ))}
        <button onClick={handleClear} className="ml-auto rounded-lg border px-3 py-1 text-sm hover:bg-gray-100">Clear board</button>
      </div>
      <canvas ref={canvasRef} width={1000} height={600}
        onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp} onPointerLeave={handleUp}
        className="w-full touch-none rounded-xl border border-gray-300 bg-white" />
    </div>
  );
}
