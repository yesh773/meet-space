import { useEffect, useRef, useState } from 'react';
import socket from '../socket.js';

// STUN helps browsers find their public address. See README for why you may need TURN later.
const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export default function useWebRTC(roomId) {
  const [localStream, setLocalStream] = useState(null);
  const [remotes, setRemotes] = useState({}); // { socketId: { name, stream } }
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [presenter, setPresenter] = useState(null);
  const [error, setError] = useState('');

  const peers = useRef({});        // { socketId: RTCPeerConnection }
  const camStream = useRef(null);  // our camera + mic
  const screenStream = useRef(null);

  useEffect(() => {
    let cancelled = false;

    // ---- Peer connection setup (one per other participant) ----
    function createPeer(id, name) {
      const pc = new RTCPeerConnection(ICE_CONFIG);

      // Send our mic + (screen if sharing, otherwise camera)
      const video = screenStream.current?.getVideoTracks()[0] || camStream.current.getVideoTracks()[0];
      [...camStream.current.getAudioTracks(), video].forEach((t) => pc.addTrack(t, camStream.current));

      // Each network route the browser finds gets forwarded to the other person
      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('ice-candidate', { to: id, candidate: e.candidate });
      };
      // Their video/audio arrived
      pc.ontrack = (e) => setRemotes((prev) => ({ ...prev, [id]: { name, stream: e.streams[0] } }));

      peers.current[id] = pc;
      return pc;
    }

    // ICE candidates can arrive before the remote description is set, so we queue them
    async function addCandidate(id, candidate) {
      const pc = peers.current[id];
      if (!pc) return;
      if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {});
      else (pc.queue ||= []).push(candidate);
    }
    async function flushQueue(pc) {
      for (const c of pc.queue || []) await pc.addIceCandidate(c).catch(() => {});
      pc.queue = [];
    }

    // ---- Socket handlers ----
    const handlers = {
      // We just joined: call everyone already in the room (we send the offers)
      'room-users': async (users) => {
        for (const u of users) {
          const pc = createPeer(u.socketId, u.name);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc-offer', { to: u.socketId, offer });
        }
      },
      // Someone is calling us: answer
      'webrtc-offer': async ({ from, name, offer }) => {
        const pc = createPeer(from, name);
        await pc.setRemoteDescription(offer);
        await flushQueue(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc-answer', { to: from, answer });
      },
      // They answered our offer
      'webrtc-answer': async ({ from, answer }) => {
        const pc = peers.current[from];
        if (!pc) return;
        await pc.setRemoteDescription(answer);
        await flushQueue(pc);
      },
      'ice-candidate': ({ from, candidate }) => addCandidate(from, candidate),
      'user-left': ({ socketId }) => {
        peers.current[socketId]?.close();
        delete peers.current[socketId];
        setRemotes((prev) => { const copy = { ...prev }; delete copy[socketId]; return copy; });
      },
      'screen-share-started': ({ name }) => setPresenter(name),
      'screen-share-stopped': () => setPresenter(null),
      'room-error': (msg) => setError(msg),
    };

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        camStream.current = stream;
        setLocalStream(stream);

        Object.entries(handlers).forEach(([event, fn]) => socket.on(event, fn));
        socket.auth = { token: localStorage.getItem('token') };
        socket.connect();
        socket.emit('join-room', { roomId }); // buffered until connected
      } catch {
        setError('Could not access your camera/microphone. Check browser permissions (and use HTTPS or localhost).');
      }
    }
    start();

    // ---- Cleanup when leaving the page ----
    return () => {
      cancelled = true;
      socket.emit('leave-room');
      Object.entries(handlers).forEach(([event, fn]) => socket.off(event, fn));
      Object.values(peers.current).forEach((pc) => pc.close());
      peers.current = {};
      camStream.current?.getTracks().forEach((t) => t.stop());
      screenStream.current?.getTracks().forEach((t) => t.stop());
      socket.disconnect();
    };
  }, [roomId]);

  // ---- Controls ----
  const toggleMic = () => {
    const next = !micOn;
    camStream.current.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  };

  const toggleCam = () => {
    const next = !camOn;
    camStream.current.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  };

  // Swap the video track on every connection. replaceTrack means no renegotiation is needed.
  const swapVideoTrack = (track) => {
    Object.values(peers.current).forEach((pc) => {
      pc.getSenders().find((s) => s.track?.kind === 'video')?.replaceTrack(track);
    });
  };

  const stopShare = () => {
    if (!screenStream.current) return;
    screenStream.current.getTracks().forEach((t) => t.stop());
    screenStream.current = null;
    swapVideoTrack(camStream.current.getVideoTracks()[0]); // back to camera
    setSharing(false);
    setPresenter(null);
    socket.emit('screen-share-stopped');
  };

  const startShare = async () => {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = screen.getVideoTracks()[0];
      screenStream.current = screen;
      swapVideoTrack(track);
      track.onended = stopShare; // user clicked the browser's "Stop sharing" button
      setSharing(true);
      setPresenter('You');
      socket.emit('screen-share-started');
    } catch {
      /* user cancelled the picker, nothing to do */
    }
  };

  return { localStream, remotes, micOn, camOn, sharing, presenter, error, toggleMic, toggleCam, startShare, stopShare };
}
