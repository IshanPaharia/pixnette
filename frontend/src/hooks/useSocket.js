import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const socketRef = useRef(null);

  useEffect(() => {
    const url = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    
    // Get or generate a unique persistent Device ID
    let deviceId = localStorage.getItem('pb_device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('pb_device_id', deviceId);
    }

    // Send deviceId securely in connection handshake auth
    const socket = io(url, {
      auth: { deviceId }
    });
    
    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('user_count', (count) => setLiveCount(count));

    return () => {
      socket.disconnect();
    };
  }, []);

  return { socket: socketRef.current, isConnected, liveCount };
}
