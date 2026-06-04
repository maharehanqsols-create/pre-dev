import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider } from './ConfigContext'
import Workspace from './pages/Workspace'
import Config from './pages/Config'
import './App.css'

function App() {
  return (
    <ConfigProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Workspace />} />
          <Route path="/config" element={<Config />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default App
