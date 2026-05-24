import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const socketRef = useRef(null);

  useEffect(() => {
    // 1. Parse URL & Device ID inside the effect (pure render phase!)
    const urlParams = new URLSearchParams(window.location.search);
    const portOverride = urlParams.get('port');
    const url = portOverride 
      ? `http://localhost:${portOverride}` 
      : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');
    
    let deviceId = localStorage.getItem('pb_device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('pb_device_id', deviceId);
    }

    // 2. Create the socket inside the effect
    // WebSockets-only: skip HTTP polling entirely, no sticky sessions needed
    // upgrade: false prevents Socket.io from attempting HTTP→WebSocket upgrade handshake
    const s = io(url, {
      auth: { deviceId },
      transports: ['websocket'],
      upgrade: false,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
    
    socketRef.current = s;

    // 3. Register event handlers
    s.on('connect', () => setIsConnected(true));
    s.on('disconnect', () => setIsConnected(false));
    s.on('user_count', (count) => setLiveCount(count));

    // 4. Cleanup: disconnect and reset the ref so the next mount starts fresh
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Return socketRef itself to avoid linter warnings during render
  return { socketRef, isConnected, liveCount };
}