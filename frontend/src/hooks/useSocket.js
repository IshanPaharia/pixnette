import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const socketRef = useRef(null);

  useEffect(() => {
    const url = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
    const socket = io(url);
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
