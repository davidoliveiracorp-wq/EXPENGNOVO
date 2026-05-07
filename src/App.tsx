import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import BoardsPage from './pages/BoardsPage'
import BoardPage from './pages/BoardPage'
import LouvoresPage from './pages/LouvoresPage'
import AdminPage from './pages/AdminPage'
import AppLayout from './components/AppLayout'
import { ReactNode } from 'react'

function PrivateRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-white text-lg">Carregando...</div>
    </div>
  )
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Navigate to="/" replace /> : <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

      {/* All authenticated routes share the sidebar layout */}
      <Route
        path="/"
        element={<PrivateRoute><AppLayout /></PrivateRoute>}
      >
        <Route index element={<BoardsPage />} />
        <Route path="boards/:id" element={<BoardPage />} />
        <Route path="louvores" element={<LouvoresPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
