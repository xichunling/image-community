import { HashRouter, Routes, Route } from 'react-router-dom'
import { UserProvider } from './contexts/UserContext'
import TabBar from './components/TabBar'
import Sidebar from './components/Sidebar'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Shelf from './pages/Shelf'
import Create from './pages/Create'
import Messages from './pages/Messages'
import Chat from './pages/Chat'
import Profile from './pages/Profile'
import WorkDetail from './pages/WorkDetail'
import CreationTree from './pages/CreationTree'
import Fork from './pages/Fork'
import Login from './pages/Login'
import Register from './pages/Register'
import TaskPreview from './pages/TaskPreview'
import UserProfile from './pages/UserProfile'
import FollowList from './pages/FollowList'

function AppLayout() {
  return (
    <div className="md:flex">
      <Sidebar />
      <div className="flex-1 md:ml-[200px] md:max-w-[1200px]">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/work/:id" element={<WorkDetail />} />
          <Route path="/work/:id/tree" element={<CreationTree />} />
          <Route path="/shelf" element={<ProtectedRoute><Shelf /></ProtectedRoute>} />
          <Route path="/create" element={<ProtectedRoute><Create /></ProtectedRoute>} />
          <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
          <Route path="/fork/:id" element={<ProtectedRoute><Fork /></ProtectedRoute>} />
          <Route path="/chat/:id" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/task/:id" element={<ProtectedRoute><TaskPreview /></ProtectedRoute>} />
          <Route path="/user/:id" element={<UserProfile />} />
          <Route path="/user/:id/followers" element={<FollowList />} />
          <Route path="/user/:id/following" element={<FollowList />} />
        </Routes>
        <TabBar />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <UserProvider>
        <AppLayout />
      </UserProvider>
    </HashRouter>
  )
}
