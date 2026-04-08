import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return (
    <Routes>
      <Route
        path="/"
        element={
          isAuthenticated
            ? <div className="p-8 text-foreground">Home Page</div>
            : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/login"
        element={<div className="p-8 text-foreground">Login Page</div>}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
