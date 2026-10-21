import { useEffect, useRef } from 'react';

// Shows one participant's stream. A <video> can't take a stream via props, so we set srcObject in an effect.
export default function VideoTile({ stream, name, muted = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-gray-800">
      {/* muted only for our own tile, otherwise we'd hear ourselves echo */}
      <video ref={videoRef} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">{name}</span>
    </div>
  );
}
