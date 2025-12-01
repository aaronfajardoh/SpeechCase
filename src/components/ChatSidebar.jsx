import React from 'react'
import { IconMessageCircle } from './Icons.jsx'

// Sidebar tab: chat (currently placeholder)
const ChatSidebar = () => {
  return (
    <div className="sidebar-tab-content">
      <div className="feature-placeholder">
        <IconMessageCircle size={48} />
        <h3>Chat</h3>
        <p>Q&A interface will appear here</p>
      </div>
    </div>
  )
}

export default ChatSidebar


