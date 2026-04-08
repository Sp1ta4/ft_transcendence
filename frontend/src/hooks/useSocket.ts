import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/stores/authStore'

export function useSocket(namespace = '/') {
  const socketRef = useRef<Socket | null>(null)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated) return

    socketRef.current = io(namespace, {
      withCredentials: true,
      transports: ['websocket'],
    })

    return () => {
      socketRef.current?.disconnect()
    }
  }, [isAuthenticated, namespace])

  return socketRef.current
}
