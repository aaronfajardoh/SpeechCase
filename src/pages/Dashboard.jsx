import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { ref as storageRef, deleteObject, getDownloadURL, getBytes } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { db, storage, functions } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import * as pdfjsLib from 'pdfjs-dist'
import {
  IconUpload,
  IconSettings,
  IconMail,
  IconDocument,
  IconTrash,
  IconEdit,
  IconMoreVertical,
  IconLoading,
  IconCheck
} from '../components/Icons.jsx'
import '../App.css'

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  // Use HTTPS for worker, fallback to protocol-relative if needed
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
}

function Dashboard() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState('documents') // 'documents', 'settings', 'support'
  const [hoveredCard, setHoveredCard] = useState(null)
  const [menuOpen, setMenuOpen] = useState(null) // documentId of open menu
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(new Set()) // Track multiple deleting documents
  const [loadingThumbnails, setLoadingThumbnails] = useState(new Set())
  const [thumbnails, setThumbnails] = useState({}) // Use state instead of ref for reactivity
  const [selectedDocs, setSelectedDocs] = useState(new Set()) // Track selected document IDs
  const fileInputRef = useRef(null)
  const thumbnailCanvasRefs = useRef({}) // Keep ref for checking if thumbnail exists

  // Fetch documents from Firestore
  useEffect(() => {
    if (!currentUser) return

    const documentsRef = collection(db, 'users', currentUser.uid, 'documents')
    const q = query(documentsRef, orderBy('processedAt', 'desc'))

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setDocuments(docs)
      setLoading(false)

      // Generate thumbnails for documents with storageUrl
      // Process documents sequentially with a small delay to avoid rate limiting
      for (let index = 0; index < docs.length; index++) {
        const doc = docs[index]
        
        // Only check ref, not state (state updates are async and might be stale)
        if (doc.storageUrl && !thumbnailCanvasRefs.current[doc.id]) {
          // Add small delay between requests to avoid rate limiting (except for first one)
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 100 * index))
          }
          generateThumbnail(doc.id, doc.storageUrl)
        }
      }
    }, (error) => {
      console.error('Error fetching documents:', error)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [currentUser])

  // Generate thumbnail from first page of PDF
  const generateThumbnail = async (docId, storageUrl) => {
    // Mark as loading
    setLoadingThumbnails(prev => new Set(prev).add(docId))
    
    try {
      let arrayBuffer
      
      // Use Firebase Storage SDK to avoid CORS issues
      // Construct storage path from documentId (pattern: users/{uid}/uploads/{docId}.pdf)
      const storagePath = `users/${currentUser.uid}/uploads/${docId}.pdf`
      
      try {
        const fileRef = storageRef(storage, storagePath)
        const bytes = await getBytes(fileRef)
        
        // getBytes can return either ArrayBuffer or Uint8Array depending on Firebase SDK version
        if (bytes instanceof ArrayBuffer) {
          arrayBuffer = bytes
        } else if (bytes instanceof Uint8Array) {
          // Create a new ArrayBuffer to avoid shared buffer issues
          arrayBuffer = new ArrayBuffer(bytes.length)
          new Uint8Array(arrayBuffer).set(bytes)
        } else {
          throw new Error(`getBytes returned unexpected type: ${bytes?.constructor?.name}`)
        }
      } catch (sdkError) {
        console.warn('Firebase SDK getBytes failed:', sdkError)
        
        // Try using download URL as fallback
        try {
          const response = await fetch(storageUrl, {
            mode: 'cors',
            cache: 'default'
          })
          
          if (!response.ok) {
            throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`)
          }
          
          arrayBuffer = await response.arrayBuffer()
        } catch (fetchError) {
          // Both methods failed - CORS is blocking everything
          console.error('CORS Error: Firebase Storage bucket needs CORS configuration. See CORS_SETUP.md for instructions.')
          throw new Error(`CORS blocked: Configure Firebase Storage CORS for localhost. See CORS_SETUP.md`)
        }
      }
      
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        verbosity: 0 // Suppress PDF.js warnings
      })
      const pdf = await loadingTask.promise
      const page = await pdf.getPage(1)
      
      // Get page dimensions at scale 1.0 to calculate proper thumbnail scale
      const viewport1x = page.getViewport({ scale: 1.0 })
      // Target thumbnail height is 200px, but render at 1.5x for better quality
      const targetDisplayHeight = 200
      const scale = (targetDisplayHeight / viewport1x.height) * 1.5
      const viewport = page.getViewport({ scale })
      
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      canvas.height = viewport.height
      canvas.width = viewport.width

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      }
      
      await page.render(renderContext).promise

      // Use JPEG with good quality for smaller file size
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      thumbnailCanvasRefs.current[docId] = dataUrl
      
      // Update state to trigger re-render
      setThumbnails(prev => ({
        ...prev,
        [docId]: dataUrl
      }))
    } catch (error) {
      console.error(`Error generating thumbnail for ${docId}:`, error)
      if (error.message?.includes('CORS') || error.message?.includes('cors')) {
        console.warn('CORS Error: Configure Firebase Storage CORS for localhost. See CORS_SETUP.md')
      }
      // Remove from loading state on error - app will show placeholder icon
    } finally {
      // Remove from loading state
      setLoadingThumbnails(prev => {
        const next = new Set(prev)
        next.delete(docId)
        return next
      })
    }
  }

  // Handle file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file || file.type !== 'application/pdf') {
      alert('Please upload a PDF file.')
      return
    }

    setUploading(true)
    try {
      // Navigate to Home page with file - Home.jsx will handle the upload
      navigate('/app', { state: { file } })
    } catch (error) {
      console.error('Error uploading file:', error)
      alert('Error uploading file. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Handle document deletion (single or multiple)
  const handleDelete = async (docId, storageUrl) => {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return
    }

    setDeleting(prev => new Set(prev).add(docId))
    setMenuOpen(null)

    try {
      // Delete from Firestore
      const docRef = doc(db, 'users', currentUser.uid, 'documents', docId)
      await deleteDoc(docRef)

      // Delete from Storage if URL exists
      if (storageUrl) {
        try {
          const fileRef = storageRef(storage, storageUrl)
          await deleteObject(fileRef)
        } catch (storageError) {
          console.warn('Error deleting file from Storage:', storageError)
          // Continue even if storage deletion fails
        }
      }

      // Clean up thumbnail
      delete thumbnailCanvasRefs.current[docId]
      setThumbnails(prev => {
        const next = { ...prev }
        delete next[docId]
        return next
      })
    } catch (error) {
      console.error('Error deleting document:', error)
      alert('Error deleting document. Please try again.')
    } finally {
      setDeleting(prev => {
        const next = new Set(prev)
        next.delete(docId)
        return next
      })
    }
  }

  // Handle multiple document deletion
  const handleDeleteMultiple = async () => {
    if (selectedDocs.size === 0) return

    const count = selectedDocs.size
    if (!confirm(`Are you sure you want to delete ${count} ${count === 1 ? 'document' : 'documents'}? This action cannot be undone.`)) {
      return
    }

    const docsToDelete = Array.from(selectedDocs)
    
    // Set all as deleting
    setDeleting(new Set(docsToDelete))

    try {
      // Delete all documents in parallel
      await Promise.all(
        docsToDelete.map(async (docId) => {
          const docData = documents.find(d => d.id === docId)
          if (!docData) return

          try {
            // Delete from Firestore
            const docRef = doc(db, 'users', currentUser.uid, 'documents', docId)
            await deleteDoc(docRef)

            // Delete from Storage if URL exists
            if (docData.storageUrl) {
              try {
                const fileRef = storageRef(storage, docData.storageUrl)
                await deleteObject(fileRef)
              } catch (storageError) {
                console.warn(`Error deleting file from Storage for ${docId}:`, storageError)
              }
            }

            // Clean up thumbnail
            delete thumbnailCanvasRefs.current[docId]
            setThumbnails(prev => {
              const next = { ...prev }
              delete next[docId]
              return next
            })
          } catch (error) {
            console.error(`Error deleting document ${docId}:`, error)
          }
        })
      )
    } catch (error) {
      console.error('Error deleting documents:', error)
      alert('Error deleting some documents. Please try again.')
    } finally {
      // Clear selection and reset deleting state
      setSelectedDocs(new Set())
      setDeleting(new Set())
    }
  }

  // Handle checkbox toggle
  const handleCheckboxToggle = (docId, e) => {
    e.stopPropagation()
    setSelectedDocs(prev => {
      const next = new Set(prev)
      if (next.has(docId)) {
        next.delete(docId)
      } else {
        next.add(docId)
      }
      return next
    })
  }

  // Handle document rename
  const handleRename = async (docId, currentName) => {
    const newName = prompt('Enter new name:', currentName)
    if (!newName || newName.trim() === currentName) return

    try {
      const docRef = doc(db, 'users', currentUser.uid, 'documents', docId)
      await updateDoc(docRef, {
        fileName: newName.trim()
      })
      setMenuOpen(null)
    } catch (error) {
      console.error('Error renaming document:', error)
      alert('Error renaming document. Please try again.')
    }
  }

  // Format date
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown date'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    })
  }

  // Handle card click - navigate to document view
  const handleCardClick = async (docId, storageUrl) => {
    if (storageUrl) {
      // Navigate with document info
      navigate('/app', { state: { documentId: docId, storageUrl: storageUrl } })
    } else {
      // If no storage URL, just navigate with docId
      navigate('/app', { state: { documentId: docId } })
    }
  }

  // Support email handler
  const handleSupportEmail = () => {
    window.location.href = `mailto:aaronfajardoh@hotmail.com?subject=SpeechCase Support Request`
  }

  if (loading) {
    return (
      <div className="dashboard-loading">
        <IconLoading size={32} />
        <p>Loading your documents...</p>
      </div>
    )
  }

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <div className="dashboard-sidebar">
        <div className="dashboard-sidebar-header">
          <h2>SpeechCase</h2>
        </div>
        
        <nav className="dashboard-sidebar-nav">
          <button
            className={`dashboard-nav-item ${activeView === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveView('documents')}
          >
            <IconDocument size={20} />
            <span>Documents</span>
          </button>

          <button
            className="dashboard-nav-item dashboard-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <IconUpload size={20} />
            <span>{uploading ? 'Uploading...' : 'Upload PDF'}</span>
          </button>

          <button
            className={`dashboard-nav-item ${activeView === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveView('settings')}
          >
            <IconSettings size={20} />
            <span>Settings</span>
          </button>

          <button
            className={`dashboard-nav-item ${activeView === 'support' ? 'active' : ''}`}
            onClick={() => setActiveView('support')}
          >
            <IconMail size={20} />
            <span>Support</span>
          </button>
        </nav>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
      </div>

      {/* Main Content */}
      <div className="dashboard-main">
        {activeView === 'documents' && (
          <>
            <div className="dashboard-header">
              <h1>Your Documents</h1>
              <p>{documents.length} {documents.length === 1 ? 'document' : 'documents'}</p>
            </div>

            {selectedDocs.size > 0 && (
              <div className="dashboard-selection-indicator">
                <span className="dashboard-selection-count">
                  {selectedDocs.size} {selectedDocs.size === 1 ? 'pdf' : 'pdfs'} selected
                </span>
                <button
                  className="dashboard-selection-delete-btn"
                  onClick={handleDeleteMultiple}
                >
                  <IconTrash size={14} />
                  Delete
                </button>
              </div>
            )}

            {documents.length === 0 ? (
              <div className="dashboard-empty">
                <IconDocument size={64} />
                <h2>No documents yet</h2>
                <p>Upload your first PDF to get started</p>
                <button
                  className="dashboard-empty-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <IconUpload size={20} />
                  Upload PDF
                </button>
              </div>
            ) : (
              <div className="dashboard-grid">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className={`dashboard-card ${hoveredCard === doc.id ? 'hovered' : ''} ${deleting.has(doc.id) ? 'deleting' : ''} ${selectedDocs.has(doc.id) ? 'selected' : ''}`}
                    onMouseEnter={() => setHoveredCard(doc.id)}
                    onMouseLeave={() => {
                      setHoveredCard(null)
                      setMenuOpen(null)
                    }}
                    onClick={(e) => {
                      // Don't navigate if clicking on menu or checkbox
                      if (e.target.closest('.dashboard-card-menu') || e.target.closest('.dashboard-card-checkbox')) return
                      handleCardClick(doc.id, doc.storageUrl)
                    }}
                  >
                    <div className="dashboard-card-checkbox-container">
                      <button
                        className={`dashboard-card-checkbox ${selectedDocs.has(doc.id) ? 'checked' : ''}`}
                        onClick={(e) => handleCheckboxToggle(doc.id, e)}
                        aria-label={`Select ${doc.fileName || doc.id}`}
                      >
                        {selectedDocs.has(doc.id) && <IconCheck size={14} />}
                      </button>
                    </div>
                    <div className="dashboard-card-thumbnail">
                      {thumbnails[doc.id] || thumbnailCanvasRefs.current[doc.id] ? (
                        <img 
                          src={thumbnails[doc.id] || thumbnailCanvasRefs.current[doc.id]} 
                          alt={doc.fileName || 'PDF thumbnail'}
                          className="dashboard-card-thumbnail-image"
                          onError={(e) => {
                            console.error(`Error loading thumbnail image for ${doc.id}`)
                            e.target.style.display = 'none'
                          }}
                        />
                      ) : loadingThumbnails.has(doc.id) ? (
                        <div className="dashboard-card-thumbnail-loading">
                          <IconLoading size={29.44} />
                          <span>Loading...</span>
                        </div>
                      ) : (
                        <div className="dashboard-card-thumbnail-placeholder">
                          <IconDocument size={44.16} />
                        </div>
                      )}
                      {deleting.has(doc.id) && (
                        <div className="dashboard-card-deleting-overlay">
                          <IconLoading size={19.2} />
                          <span>Deleting...</span>
                        </div>
                      )}
                    </div>

                    <div className="dashboard-card-content">
                      <h3 className="dashboard-card-title">
                        {doc.fileName || doc.id}
                      </h3>
                      <p className="dashboard-card-date">
                        {formatDate(doc.processedAt || doc.uploadedAt)}
                      </p>
                      {doc.pageCount && (
                        <p className="dashboard-card-meta">
                          {doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'}
                        </p>
                      )}
                    </div>

                    {hoveredCard === doc.id && (
                      <div className="dashboard-card-menu">
                        <button
                          className="dashboard-card-menu-trigger"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuOpen(menuOpen === doc.id ? null : doc.id)
                          }}
                        >
                          <IconMoreVertical size={16} />
                        </button>
                        {menuOpen === doc.id && (
                          <div className="dashboard-card-menu-dropdown">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRename(doc.id, doc.fileName || doc.id)
                              }}
                            >
                              <IconEdit size={12.8} />
                              <span>Rename</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(doc.id, doc.storageUrl)
                              }}
                              className="danger"
                            >
                              <IconTrash size={12.8} />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeView === 'settings' && (
          <div className="dashboard-view">
            <div className="dashboard-view-header">
              <h1>Settings</h1>
            </div>
            <div className="dashboard-view-content">
              <p>Settings panel coming soon...</p>
            </div>
          </div>
        )}

        {activeView === 'support' && (
          <div className="dashboard-view">
            <div className="dashboard-view-header">
              <h1>Support</h1>
            </div>
            <div className="dashboard-view-content">
              <div className="dashboard-support">
                <IconMail size={48} />
                <h2>Need Help?</h2>
                <p>If you're experiencing any technical issues or have questions, please reach out to us.</p>
                <button
                  className="dashboard-support-btn"
                  onClick={handleSupportEmail}
                >
                  <IconMail size={20} />
                  Email Support
                </button>
                <p className="dashboard-support-email">aaronfajardoh@hotmail.com</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard

