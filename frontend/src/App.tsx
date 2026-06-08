import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Workspace from './pages/Workspace'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Workspace />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App