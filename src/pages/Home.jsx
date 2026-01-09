import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import { renderTextLayer } from 'pdfjs-dist/build/pdf'
import { PDFDocument, rgb } from 'pdf-lib'
import { httpsCallable } from 'firebase/functions'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { doc, getDoc, onSnapshot, collection, query, orderBy, updateDoc, setDoc } from 'firebase/firestore'
import { functions, storage, db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import '../App.css'
import 'pdfjs-dist/web/pdf_viewer.css'

import {
  IconUpload,
  IconDocument,
  IconPlay,
  IconPause,
  IconStop,
  IconReset,
  IconRewind,
  IconForward,
  IconDownload,
  IconClose,
  IconMinimize,
  IconSpeaker,
  IconLoading,
  IconHighlighter,
  IconCursor,
  IconZoomIn,
  IconZoomOut,
  IconUndo,
  IconRedo,
  IconTarget,
  IconNavigation,
  IconTimeline,
  IconUsers,
  IconMessageCircle,
  IconFileText,
  IconChevronLeft,
  IconChevronRight,
  IconExpandTimeline,
  IconMinimizeTimeline,
  IconEye,
  IconEyeOff,
  IconScissors
} from '../components/Icons.jsx'
import ProportionalTimeline from '../components/ProportionalTimeline.jsx'
import PagesSidebar from '../components/PagesSidebar.jsx'
import TimelineSidebar from '../components/TimelineSidebar.jsx'
import CharactersSidebar from '../components/CharactersSidebar.jsx'
import CharactersFullView from '../components/CharactersFullView.jsx'
import ChatSidebar from '../components/ChatSidebar.jsx'
import HighlightsSidebar from '../components/HighlightsSidebar.jsx'
import ExhibitsSidebar from '../components/ExhibitsSidebar.jsx'
import { extractExhibits } from '../../services/chunking.js'
import SummaryFullView from '../components/SummaryFullView.jsx'
import HighlightsFullView from '../components/HighlightsFullView.jsx'

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

// Guards to prevent overlapping PDF render operations on the same canvases.
// Instead of skipping renders, we serialize them by awaiting the previous run.
// pdf.js throws "Cannot use the same canvas during multiple render() operations"
// if a second render starts before the first one finishes (e.g., on resize).
let renderPagesPromise = null
let renderThumbnailsPromise = null
let activeRenderTasks = new Map() // Store active render tasks by page number to cancel them
let activeThumbnailTasks = new Map() // Store active thumbnail render tasks by page number

function Home() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const documentIdFromUrl = params.documentId // Get documentId from URL params
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfDoc, setPdfDoc] = useState(null)
  
  // Track pdfDoc state changes
  useEffect(() => {
  }, [pdfDoc])
  
  // Track pdfFile state changes
  useEffect(() => {
  }, [pdfFile])
  const [extractedText, setExtractedText] = useState('')
  const [textItems, setTextItems] = useState([]) // Store text items with positions for mapping
  const [isLoading, setIsLoading] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isTTSLoading, setIsTTSLoading] = useState(false) // Loading state for TTS synthesis
  const [currentPage, setCurrentPage] = useState(1) // Current viewing page (1-indexed) - for tracking
  const [totalPages, setTotalPages] = useState(0)
  const [error, setError] = useState('')
  const [language, setLanguage] = useState('auto') // 'auto', 'en', 'es'
  const [detectedLanguage, setDetectedLanguage] = useState(null)
  const [startPosition, setStartPosition] = useState(0) // Character position to start reading from
  const [playbackSpeed, setPlaybackSpeed] = useState(1.3) // Playback speed (0.5x to 2.0x)
  const [pageScale, setPageScale] = useState(1.5) // Scale for PDF rendering
  const [renderedPages, setRenderedPages] = useState([]) // Track which pages are rendered
  const [pageData, setPageData] = useState([]) // Store page rendering data
  const [highlights, setHighlights] = useState([]) // Store highlight data: { page, x, y, width, height, text, connections }
  const isInitialLoadRef = useRef(true) // Track if we're in initial load phase to prevent auto-save
  const [highlightHistory, setHighlightHistory] = useState([[]]) // History stack for undo/redo
  const [historyIndex, setHistoryIndex] = useState(0) // Current position in history
  const [interactionMode, setInteractionMode] = useState('select') // 'select', 'read', or 'highlight'
  const [highlightColor, setHighlightColor] = useState('yellow') // 'yellow', 'green', 'blue'
  const [isSnippingMode, setIsSnippingMode] = useState(false) // Track if snipping tool is active
  const [snipSelection, setSnipSelection] = useState(null) // Track snip selection: { startX, startY, endX, endY, page }
  const [isSnipDragging, setIsSnipDragging] = useState(false) // Track if user is dragging to create snip selection
  const isSnipDraggingRef = useRef(false) // Ref to track dragging state synchronously
  const snipSelectionRef = useRef(null) // Ref to track selection state synchronously
  const [hoveredHighlightId, setHoveredHighlightId] = useState(null) // Track which highlight is being hovered
  const [connectingFrom, setConnectingFrom] = useState(null) // Track connection start: { highlightId, dot: 'left' | 'right' }
  const connectionLayerRefs = useRef({}) // Store connection layer refs by page number
  const globalConnectionLayerRef = useRef(null) // Single overlay for cross-page connections
  const hoveredHighlightIdRef = useRef(null) // Ref for hover state to avoid closure issues
  const isHoveringTooltipRef = useRef(false) // Track if mouse is over tooltip
  const [mousePosition, setMousePosition] = useState(null) // Track mouse position for temporary connection line: { x, y, page, clientX, clientY }
  const [showTooltipFor, setShowTooltipFor] = useState(null) // Track which highlight shows tooltip: { highlightId, x, y, page? }
  const tooltipLayerRefs = useRef({}) // Store tooltip layer refs by page number
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState(null)
  const [currentSelection, setCurrentSelection] = useState(null)
  const canvasRefs = useRef({}) // Store canvas refs by page number
  const textLayerRefs = useRef({}) // Store text layer refs by page number
  const highlightLayerRefs = useRef({}) // Store highlight layer refs by page number
  const selectionLayerRefs = useRef({}) // Store selection overlay layer refs by page number
  const snipLayerRefs = useRef({}) // Store snip selection layer refs by page number
  const thumbnailRefs = useRef({}) // Store thumbnail canvas refs by page number
  const isDraggingSelectionRef = useRef(false) // Track if user is dragging to select
  const selectionStartRangeRef = useRef(null) // Store the start of selection range
  const lastValidRangeRef = useRef(null) // Track last valid range during mouse move (for whitespace handling)
  const persistentSelectionRangeRef = useRef(null) // Store persistent selection range for select mode
  const [renderedThumbnails, setRenderedThumbnails] = useState([]) // Track which thumbnails are rendered
  const [sidebarView, setSidebarView] = useState('pages') // 'pages', 'timeline', 'characters', 'chat', 'highlights', 'exhibits'
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false) // Sidebar collapsed state
  const [sidebarWidth, setSidebarWidth] = useState(230) // Sidebar width in pixels
  const [isExhibitsExpanded, setIsExhibitsExpanded] = useState(false) // Exhibits sidebar expanded state
  const [isResizing, setIsResizing] = useState(false) // Track if sidebar is being resized
  const isResizingRef = useRef(false) // Track if user is resizing the sidebar
  const resizeStartXRef = useRef(0) // Track initial mouse X position when resizing starts
  const resizeStartWidthRef = useRef(230) // Track initial sidebar width when resizing starts
  const normalSidebarWidthRef = useRef(230) // Store normal sidebar width before expansion
  const previousInteractionModeRef = useRef('read') // Track previous interaction mode to detect changes
  const interactionModeRef = useRef('read') // Track current interaction mode for click handlers
  const sidebarWidthRef = useRef(230) // Track current sidebar width
  const isSidebarCollapsedRef = useRef(false) // Track current sidebar collapsed state
  const sidebarViewRef = useRef('pages') // Track current sidebar view
  const previousSidebarViewRef = useRef('pages') // Track previous sidebar view to detect changes
  const processingFileRef = useRef(null) // Track file being processed to prevent duplicate processing
  const [documentId, setDocumentId] = useState(null) // Document ID for AI features
  const [highlightItems, setHighlightItems] = useState([]) // Store highlight items for sidebar: { id, text, color, order }
  const [isPDFProcessing, setIsPDFProcessing] = useState(false) // Track if PDF is being processed
  const [timeline, setTimeline] = useState(null) // Timeline data
  const [isTimelineLoading, setIsTimelineLoading] = useState(false) // Timeline loading state
  const [timelineError, setTimelineError] = useState(null) // Timeline error message
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false) // Timeline expanded in main view
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false) // Summary expanded in main view
  const [isHighlightsExpanded, setIsHighlightsExpanded] = useState(false) // Highlights expanded in main view
  const [summaryText, setSummaryText] = useState('') // Store summary text for full view
  const [selectedEvent, setSelectedEvent] = useState(null) // Selected event for details tooltip
  const [timelineIcons, setTimelineIcons] = useState({}) // Icons for timeline events
  const [characters, setCharacters] = useState(null) // Characters data
  const [isCharactersLoading, setIsCharactersLoading] = useState(false) // Characters loading state
  const [charactersError, setCharactersError] = useState(null) // Characters error message
  const [isCharactersExpanded, setIsCharactersExpanded] = useState(false) // Characters expanded in main view
  const [chatHistory, setChatHistory] = useState([]) // Chat conversation history
  const fileInputRef = useRef(null)
  const utteranceRef = useRef(null)
  const synthRef = useRef(null)
  const pdfArrayBufferRef = useRef(null) // Store original PDF array buffer
  const currentPlaybackPositionRef = useRef(0) // Track current playback position
  const playbackStartTimeRef = useRef(null) // Track when playback started
  const playbackStartPositionRef = useRef(0) // Track position when playback started
  const lastBoundaryPositionRef = useRef(0) // Track last known position from boundary events
  const isPlayingRef = useRef(false) // Track playing state for Media Session handlers
  const playbackInProgressRef = useRef(false) // Guard to prevent multiple simultaneous playback attempts
  const extractedTextRef = useRef('') // Track extracted text for Media Session handlers
  const startPositionRef = useRef(0) // Track start position for Media Session handlers
  const pdfFileRef = useRef(null) // Track PDF file for Media Session metadata
  const languageRef = useRef('auto') // Track language for Media Session handlers
  const detectedLanguageRef = useRef(null) // Track detected language for Media Session handlers
  const playbackSpeedRef = useRef(1.3) // Track playback speed for Media Session handlers
  const markedStartElementRef = useRef(null) // Track the element marked as start position
  const currentReadingElementRef = useRef(null) // Track the element currently being read
  const previousBoundaryPositionRef = useRef(null) // Track previous boundary position to highlight current word
  const currentReadingPageRef = useRef(null) // Track the page currently being read to prevent jumping
  const lastValidHighlightPositionRef = useRef(null) // Track last valid highlight position to prevent jumps
  const lastHighlightedCharIndexRef = useRef(null) // Track the charIndex of the last highlighted element for continuity
  const lastHighlightedElementRef = useRef(null) // Track the actual DOM element that was last highlighted
  const currentHazeOverlayRef = useRef(null) // Track the current haze overlay element
  const historyIndexRef = useRef(0) // Track current history index for undo/redo
  const highlightHistoryRef = useRef([[]]) // Track current highlight history for undo/redo
  const highlightsRef = useRef([]) // Track current highlights for undo/redo
  const isDraggingHighlightRef = useRef(false) // Track if user is currently dragging a highlight
  const textItemsRef = useRef([]) // Track text items for event handlers
  const audioRef = useRef(null) // Track audio element for Google TTS playback
  const googleTtsTextRef = useRef('') // Track text being spoken via Google TTS
  const googleTtsStartPositionRef = useRef(0) // Track start position for Google TTS
  const isCancelledRef = useRef(false) // Track if Google TTS playback is cancelled
  const currentChunkIndexRef = useRef(0) // Track current chunk index for Google TTS
  const [isMobile, setIsMobile] = useState(false) // Track if device is mobile
  const [toolbarVisible, setToolbarVisible] = useState(true) // Toolbar visibility for mobile
  const [controlsPanelExpanded, setControlsPanelExpanded] = useState(false) // Controls panel expanded state for mobile
  const [mobileControlsOpacity, setMobileControlsOpacity] = useState(1) // Mobile bottom controls opacity
  const [isControlsPanelMinimized, setIsControlsPanelMinimized] = useState(false) // Controls panel minimized state for desktop
  const [isHoveringMinimizedPanel, setIsHoveringMinimizedPanel] = useState(false) // Track hover state for minimized panel
  const [speedDropdownOpen, setSpeedDropdownOpen] = useState(false) // Speed dropdown open state
  const lastScrollYRef = useRef(0) // Track last scroll position for auto-hide toolbar
  const scrollTimeoutRef = useRef(null) // Timeout for showing toolbar after scroll stops
  const mobileControlsTimeoutRef = useRef(null) // Timeout for fading mobile controls
  const speedDropdownRef = useRef(null) // Ref for speed dropdown
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true) // Auto-scroll to follow reading position
  const autoScrollEnabledRef = useRef(true) // Ref to track auto-scroll state synchronously
  const [hasCurrentReadingPosition, setHasCurrentReadingPosition] = useState(false) // Track if there's a current reading position (for button visibility)
  const [textLayerVisible, setTextLayerVisible] = useState(false) // Track text layer visibility (default: invisible)
  const isProgrammaticScrollRef = useRef(false) // Track if scroll is programmatic (from our code) vs manual
  const lastProgrammaticScrollTimeRef = useRef(0) // Track when we last scrolled programmatically
  const pendingScrollTimeoutRef = useRef(null) // Track pending scroll timeout to cancel if needed
  const scrollPositionBeforeZoomRef = useRef(null) // Store scroll position before zoom to restore after re-render
  const scrollPositionBeforeFullViewRef = useRef(null) // Store scroll position before opening full view to restore after returning
  const [exhibits, setExhibits] = useState([]) // Store detected exhibits
  const exhibitsRef = useRef([]) // Ref for exhibits to avoid stale closures

  // Handle file upload/change - defined early so it's available for useEffects
  async function handleFileChange(event, existingDocumentId = null) {
    const file = event.target.files[0]
    if (!file) {
      return
    }

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.')
      return
    }
    setError('')
    if (typeof clearStartMarker === 'function') clearStartMarker()
    if (typeof clearReadingHighlight === 'function') clearReadingHighlight()
    setPdfFile(file)
    setIsLoading(true)
    setExtractedText('')
    setTextItems([])
    setCurrentPage(1)
    setTotalPages(0)
    setStartPosition(0)
    
    // Only clear highlights/highlightItems if this is a NEW document (not loading existing)
    const isNewDocument = !existingDocumentId && !documentId
    if (isNewDocument) {
      setHighlights([])
      setHighlightItems([])
      setHighlightColor('yellow') // Reset to yellow when uploading a new PDF
    }

    try {
      const arrayBuffer = await file.arrayBuffer()
      // Clone the ArrayBuffer to prevent it from being detached when PDF.js uses it
      pdfArrayBufferRef.current = arrayBuffer.slice(0)
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      setPdfDoc(pdf)
      setTotalPages(pdf.numPages)
      // Force a re-render check after state updates
      setTimeout(() => {}, 0);
      
      // Mark initial load as complete - now user actions should be saved
      // This must happen before any user interaction (like creating highlights)
      isInitialLoadRef.current = false
      
      // Only clear highlights when loading a NEW PDF (not when reopening existing)
      if (isNewDocument) {
        setHighlights([]) // Clear highlights when loading new PDF
        setHighlightItems([]) // Clear highlight items when loading new PDF
      }
      setHighlightHistory([[]]) // Reset history
      setHistoryIndex(0)
      historyIndexRef.current = 0
      highlightHistoryRef.current = [[]]
      highlightsRef.current = []

      // Extract all text, filtering out headers and footers using repetition detection
      // First, build a map of text repetition across pages
      const { textToPages, pageTextItems } = await buildRepetitionMap(pdf, pdf.numPages)
      
      // Initial extraction with sync version for immediate display
      // Build text consistently: trim items to avoid double spaces, join with single space
      let fullText = ''
      for (const pageData of pageTextItems) {
        const filteredItems = filterHeadersAndFootersSync(pageData, textToPages)
        // Trim each item to remove leading/trailing spaces, then join with single space
        // This ensures consistent spacing that matches textItems construction
        const pageText = filteredItems.map(item => item.str.trim()).filter(str => str.length > 0).join(' ')
        if (pageText.length > 0) {
          if (fullText.length > 0) {
            fullText += '\n\n' // Add page break before this page's text
          }
          fullText += pageText
        }
      }

      const initialText = fullText
      setExtractedText(initialText)
      
      // Background: Re-process with enhanced filtering (non-blocking)
      // This updates the text seamlessly without interrupting TTS
      setTimeout(async () => {
        try {
          console.log('Starting background footer filtering...')
          let enhancedText = ''
          
          for (const pageData of pageTextItems) {
            // Apply repetition-based filtering
            const filteredItems = await filterHeadersAndFootersWithLLM(pageData, textToPages)
            // Trim each item to remove leading/trailing spaces, then join with single space
            // This ensures consistent spacing that matches textItems construction
            const pageText = filteredItems.map(item => item.str.trim()).filter(str => str.length > 0).join(' ')
            if (pageText.length > 0) {
              if (enhancedText.length > 0) {
                enhancedText += '\n\n' // Add page break before this page's text
              }
              enhancedText += pageText
            }
          }
          
          const finalText = enhancedText
          
          // Only update if text changed (to avoid unnecessary re-renders)
          if (finalText !== initialText) {
            setExtractedText(finalText)
            console.log('Footer classification completed - text updated in background')
          } else {
            console.log('Footer classification completed - no changes detected')
          }
        } catch (error) {
          console.warn('Background footer classification failed:', error)
          // Keep using initial text - no interruption
        }
      }, 100) // Small delay to ensure initial render completes
      
      // Auto-detect language
      if (language === 'auto' && initialText) {
        const detected = detectLanguage(initialText)
        console.log('Detected language:', detected, 'for text length:', initialText.length)
        setDetectedLanguage(detected)
      }

      // Upload PDF to Storage and process for AI features
      if (initialText && initialText.length > 0 && currentUser) {
        // Use existing documentId if provided, otherwise create a new one
        const finalDocumentId = existingDocumentId || documentId || `${file.name}-${Date.now()}`
        
        // Only create new documentId if we don't have one
        if (!existingDocumentId && !documentId) {
          setDocumentId(finalDocumentId)
        } else {
          // Ensure documentId state is set even if we're reusing
          if (finalDocumentId !== documentId) {
            setDocumentId(finalDocumentId)
          }
        }
        
        // Upload PDF to Storage first (only if new document, otherwise reuse existing storage)
        let storageUrl = null
        const isNewDocument = !existingDocumentId && !documentId
        
        // Only clear timeline if this is a NEW document (not loading existing)
        if (isNewDocument) {
          setTimeline(null) // Clear previous timeline
          setTimelineError(null)
          setTimelineIcons({}) // Clear previous icons
        }
        
        // Check if document already exists and has been processed
        let documentAlreadyProcessed = false
        if (!isNewDocument) {
          try {
            const docRef = doc(db, 'users', currentUser.uid, 'documents', finalDocumentId)
            const docSnap = await getDoc(docRef)
            if (docSnap.exists()) {
              const docData = docSnap.data()
              // Check if document has been processed (has chunks or other AI processing indicators)
              documentAlreadyProcessed = !!(docData.storageUrl || docData.processedAt || docData.chunks)
              if (docData.storageUrl) {
                storageUrl = docData.storageUrl
                console.log('Using existing Storage URL:', storageUrl)
              }
            }
          } catch (error) {
            console.warn('Error checking existing document:', error)
          }
        }
        
        // Only set isPDFProcessing for new documents or if document hasn't been processed yet
        if (isNewDocument || !documentAlreadyProcessed) {
          setIsPDFProcessing(true)
        } else {
          setIsPDFProcessing(false)
          // Mark initial load as complete - now user actions should be saved
          isInitialLoadRef.current = false
        }
        
        if (isNewDocument) {
          // New document - upload to storage
          try {
            const storageRef = ref(storage, `users/${currentUser.uid}/uploads/${finalDocumentId}.pdf`)
            await uploadBytes(storageRef, file)
            storageUrl = await getDownloadURL(storageRef)
            console.log('PDF uploaded to Storage:', storageUrl)
          } catch (storageError) {
            console.error('Error uploading PDF to Storage:', storageError)
            // Continue processing even if storage upload fails
          }
          
          // Create document in Firestore immediately so highlights can be saved
          // This must happen before processPDFForAI to ensure document exists
          try {
            const docRef = doc(db, 'users', currentUser.uid, 'documents', finalDocumentId)
            const now = new Date().toISOString()
            await setDoc(docRef, {
              fileName: file.name,
              pageCount: pdf.numPages,
              textLength: initialText.length,
              storageUrl: storageUrl,
              fileSize: file.size,
              uploadedAt: now,
              createdAt: now,
              processedAt: now, // Set initial processedAt so document shows in dashboard
              processingStatus: 'pending'
            }, { merge: true })
            console.log('Document created in Firestore:', finalDocumentId)
          } catch (docError) {
            console.error('Error creating document in Firestore:', docError)
            // Continue even if document creation fails - processPDFForAI will try again
          }
        }
        
        // Process PDF in background (don't block UI) - only if needed
        if (isNewDocument || !documentAlreadyProcessed) {
          processPDFForAI(finalDocumentId, initialText, {
            fileName: file.name,
            pageCount: pdf.numPages,
            textLength: initialText.length,
            storageUrl: storageUrl,
            fileSize: file.size,
            uploadedAt: new Date().toISOString()
          }).then(() => {
            setIsPDFProcessing(false)
            // Redirect to document route after new upload completes
            if (isNewDocument && finalDocumentId) {
              navigate(`/document/${finalDocumentId}`, { replace: true })
            }
          }).catch(err => {
            console.error('Error processing PDF for AI:', err)
            setIsPDFProcessing(false)
            // Don't show error to user - AI features will just be unavailable
            // Still redirect even if processing fails
            if (isNewDocument && finalDocumentId) {
              navigate(`/document/${finalDocumentId}`, { replace: true })
            }
          })
        }
      }
      
      // Initialize Media Session metadata so macOS recognizes this as a media source
      if ('mediaSession' in navigator) {
        console.log('Initializing Media Session metadata for PDF:', file.name)
        navigator.mediaSession.metadata = new MediaMetadata({
          title: file.name,
          artist: 'Text-to-Speech',
          album: 'PDF Reader'
        })
        // Set to 'paused' initially so macOS recognizes this as an active media source
        // This helps macOS route media keys to the browser
        navigator.mediaSession.playbackState = 'paused'
        console.log('Media Session initialized. PlaybackState:', navigator.mediaSession.playbackState)
        console.log('Media Session metadata:', navigator.mediaSession.metadata)
      }
    } catch (err) {
      setError('Error reading PDF: ' + err.message)
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  // Extract exhibits when text is loaded
  useEffect(() => {
    if (extractedText && extractedText.length > 0 && !isPDFProcessing) {
      const extracted = extractExhibits(extractedText)
      setExhibits(extracted)
      exhibitsRef.current = extracted
    } else {
      setExhibits([])
      exhibitsRef.current = []
    }
  }, [extractedText, isPDFProcessing])

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Load document from URL params or location state
  useEffect(() => {
    const loadDocument = async () => {
      // Priority: URL params > location state
      const docId = documentIdFromUrl || location.state?.documentId
      
      if (!currentUser) {
        return // Wait for auth
      }
      
      // If we already have this document loaded, don't reload
      // Use docId directly since state updates are async
      if (pdfDoc && (documentId === docId || documentIdFromUrl === docId)) {
        return
      }
      
      // Prevent duplicate loading - use a ref to track loading state per docId
      const loadingKey = `loading_${docId}`
      if (processingFileRef.current === loadingKey) {
        return
      }
      
      // Mark as loading
      processingFileRef.current = loadingKey
      
      // Handle file upload from location state (new upload)
      if (location.state?.file && !docId) {
        const file = location.state.file
        const fileKey = `${file.name}-${file.size}-${file.lastModified}`
        
        if (processingFileRef.current === fileKey) {
          return
        }
        
        processingFileRef.current = fileKey
        const event = { target: { files: [file] } }
        await handleFileChange(event)
        navigate(location.pathname, { replace: true, state: null })
        
        setTimeout(() => {
          if (processingFileRef.current === fileKey) {
            processingFileRef.current = null
          }
        }, 2000)
        return
      }
      
      // Load existing document from Firestore
      if (docId) {
        try {
          setIsLoading(true)
          setError('')
          
          const docRef = doc(db, 'users', currentUser.uid, 'documents', docId)
          const docSnap = await getDoc(docRef)
          
          if (!docSnap.exists()) {
            setError('Document not found')
            setIsLoading(false)
            return
          }
          
          const docData = docSnap.data()
          setDocumentId(docId)
          
          // Load timeline if it exists
          if (docData.timeline && Array.isArray(docData.timeline)) {
            // Filter out events with completely null dates or validate them
            const validatedTimeline = docData.timeline.map((event, index) => {
              // If event has no date fields at all, keep it but ensure it has at least a placeholder
              if (!event.date && !event.date_original_format && !event.date_normalized) {
                return { ...event, date: `Event ${index + 1}` }
              }
              // Ensure event has order and importance fields
              return {
                ...event,
                order: event.order || index + 1,
                importance: event.importance || 'medium'
              }
            }).sort((a, b) => (a.order || 0) - (b.order || 0)) // Sort by order
            setTimeline(validatedTimeline)
          }
          
          // Load timeline icons if they exist
          if (docData.timelineIcons && typeof docData.timelineIcons === 'object') {
            setTimelineIcons(docData.timelineIcons)
          }
          
          // Load summary if it exists
          if (docData.summary) {
            setSummaryText(docData.summary)
          }
          
          // Load highlights if they exist
          if (docData.highlights && Array.isArray(docData.highlights)) {
            setHighlights(docData.highlights)
          }
          
          // Load highlightItems from Firestore if they exist (to preserve user's custom order)
          // If they don't exist, the useEffect will create them from highlights
          if (docData.highlightItems && Array.isArray(docData.highlightItems) && docData.highlightItems.length > 0) {
            setHighlightItems(docData.highlightItems)
          }
          
          // Load chat history if it exists
          if (docData.chatHistory && Array.isArray(docData.chatHistory)) {
            setChatHistory(docData.chatHistory)
          }
          
          // Mark initial load as complete - now user actions should be saved
          isInitialLoadRef.current = false
          
          // Load PDF from Storage
          if (docData.storageUrl) {
            try {
              // Try using Firebase Storage SDK first to avoid CORS issues
              const storagePath = `users/${currentUser.uid}/uploads/${docId}.pdf`
              let arrayBuffer
              
              try {
                const { ref: storageRef, getBytes } = await import('firebase/storage')
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
                console.warn('Firebase SDK getBytes failed, trying fetch:', sdkError)
                
                // Fallback to fetch if SDK fails
                const response = await fetch(docData.storageUrl, {
                  mode: 'cors',
                  cache: 'default'
                })
                
                if (!response.ok) {
                  throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}. This may be a CORS issue - check Firebase Storage CORS configuration.`)
                }
                
                // Check if response is actually a PDF
                const contentType = response.headers.get('content-type')
                if (contentType && !contentType.includes('application/pdf')) {
                  throw new Error(`Expected PDF but got ${contentType}. The file may be corrupted or the URL is invalid.`)
                }
                
                arrayBuffer = await response.arrayBuffer()
                
                // Validate that we got actual data
                if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                  throw new Error('Received empty PDF data from storage')
                }
              }
              
              const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
              const fileName = docData.fileName || `${docId}.pdf`
              const file = new File([blob], fileName, { type: 'application/pdf' })
              
              // Process the file like a normal upload, passing the existing documentId
              // Set documentId state BEFORE calling handleFileChange to prevent reload
              if (docId && docId !== documentId) {
                setDocumentId(docId)
              }
              const event = { target: { files: [file] } }
              await handleFileChange(event, docId)
              
              // Clear loading flag after successful load
              if (processingFileRef.current === loadingKey) {
                processingFileRef.current = null
              }
            } catch (fetchError) {
              console.error('Error loading PDF from storage:', fetchError)
              setError(`Error loading PDF: ${fetchError.message}. If this is a CORS error, check Firebase Storage CORS configuration.`)
              setIsLoading(false)
              // Clear loading flag on error
              if (processingFileRef.current === loadingKey) {
                processingFileRef.current = null
              }
            }
          } else {
            setError('PDF file not found in storage')
            setIsLoading(false)
            // Clear loading flag on error
            if (processingFileRef.current === loadingKey) {
              processingFileRef.current = null
            }
          }
          
          // Clear location state to prevent re-loading
          if (location.state) {
            navigate(location.pathname, { replace: true, state: null })
          }
        } catch (err) {
          console.error('Error loading document:', err)
          setError('Error loading document: ' + err.message)
          setIsLoading(false)
          // Clear loading flag on error
          if (processingFileRef.current === loadingKey) {
            processingFileRef.current = null
          }
        }
      }
    }
    
    loadDocument()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentIdFromUrl, currentUser, location.state])

  // Set up real-time listeners for document data (timeline, summary, characters)
  useEffect(() => {
    if (!documentId || !currentUser) {
      return
    }
    
    const docRef = doc(db, 'users', currentUser.uid, 'documents', documentId)
    
    // Listen for document updates (timeline, summary, highlights, chatHistory)
    const unsubscribeDoc = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data()
        
        // Update timeline if it exists and is different
        if (data.timeline && Array.isArray(data.timeline)) {
          // Apply same validation as initial load - filter null dates and ensure proper structure
          const validatedTimeline = data.timeline.map((event, index) => {
            // If event has no date fields at all, keep it but ensure it has at least a placeholder
            if (!event.date && !event.date_original_format && !event.date_normalized) {
              return { ...event, date: `Event ${index + 1}` }
            }
            // Ensure event has order and importance fields
            return {
              ...event,
              order: event.order || index + 1,
              importance: event.importance || 'medium'
            }
          }).sort((a, b) => (a.order || 0) - (b.order || 0)) // Sort by order
          setTimeline(validatedTimeline)
        }
        
        // Update timeline icons if they exist and are different
        if (data.timelineIcons && typeof data.timelineIcons === 'object') {
          setTimelineIcons(data.timelineIcons)
        }
        
        // Update summary if it exists and is different
        if (data.summary && data.summary !== summaryText) {
          setSummaryText(data.summary)
        }
        
        // Update highlights if they exist and are different
        if (data.highlights && Array.isArray(data.highlights)) {
          setHighlights(data.highlights)
        }
        
        // Don't update highlightItems from onSnapshot - let the useEffect create them from highlights
        // This ensures they're sorted by text position, not creation order
        
        // Update chat history if it exists and is different
        if (data.chatHistory && Array.isArray(data.chatHistory)) {
          setChatHistory(data.chatHistory)
        }
      }
    }, (error) => {
      console.error('Error listening to document updates:', error)
    })
    
    // Listen for characters subcollection
    const charactersRef = collection(db, 'users', currentUser.uid, 'documents', documentId, 'characters')
    const charactersQuery = query(charactersRef, orderBy('characterIndex', 'asc'))
    
    const unsubscribeCharacters = onSnapshot(charactersQuery, (snapshot) => {
      const charactersList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      
      if (charactersList.length > 0) {
        // Get metadata from main document first to check for authorNames
        getDoc(docRef).then((docSnap) => {
          let filteredCharacters = charactersList
          
          // Apply author filtering if authorNames are stored in document metadata
          if (docSnap.exists()) {
            const data = docSnap.data()
            
            // Filter out authors if authorNames are stored
            if (data.authorNames && Array.isArray(data.authorNames) && data.authorNames.length > 0) {
              const normalizedAuthorNames = data.authorNames.map(name => name.toLowerCase().trim())
              filteredCharacters = charactersList.filter(character => {
                const characterName = character.name ? character.name.toLowerCase().trim() : ''
                const isAuthor = normalizedAuthorNames.some(authorName => {
                  return characterName === authorName || 
                         characterName.includes(authorName) || 
                         authorName.includes(characterName)
                })
                return !isAuthor
              })
            }
            
            // Set characters with filtering applied
            setCharacters({
              characters: filteredCharacters,
              isOrgChart: data.isOrgChart || false,
            })
          } else {
            // No document metadata - set characters without filtering
            // Note: Author filtering should ideally happen in the Cloud Function when generating characters
            setCharacters({
              characters: charactersList,
              isOrgChart: characters?.isOrgChart || false,
            })
          }
        }).catch((err) => {
          console.error('Error fetching character metadata:', err)
          // Fallback: set characters without filtering if metadata fetch fails
          setCharacters({
            characters: charactersList,
            isOrgChart: characters?.isOrgChart || false,
          })
        })
      } else {
        // Don't set to null if we already have characters (prevents clearing on initial empty snapshot)
        // Only set to null if this is a deliberate deletion (snapshot has metadata indicating deletion)
        setCharacters(prev => {
          // If we already have characters, keep them (this handles the initial empty snapshot case)
          if (prev && prev.characters && prev.characters.length > 0) {
            return prev
          }
          // Otherwise, set to null (no characters exist)
          return null
        })
      }
    }, (error) => {
      console.error('Error listening to characters:', error)
    })
    
    return () => {
      unsubscribeDoc()
      unsubscribeCharacters()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, currentUser])

  // Helper function to estimate size of data in bytes (rough estimate)
  const estimateSize = (data) => {
    try {
      return new Blob([JSON.stringify(data)]).size
    } catch (e) {
      return 0
    }
  }

  // Helper function to update document fields in Firestore
  const updateDocumentField = useCallback(async (field, value) => {
    if (!documentId || !currentUser) {
      console.warn('Cannot update document: missing documentId or currentUser')
      return
    }

    try {
      // Check size before saving (Firestore has ~1MB limit per document)
      const size = estimateSize(value)
      const maxSize = 900000 // 900KB to leave room for other fields
      
      if (size > maxSize) {
        console.warn(`Field ${field} is too large (${size} bytes), skipping save to avoid transaction error`)
        // For highlights, we can save a simplified version or skip
        if (field === 'highlights') {
          // Only save essential highlight data (without full rectangle arrays)
          const simplifiedHighlights = value.map(h => ({
            id: h.id,
            page: h.page,
            text: h.text,
            color: h.color,
            // Skip rects, scale, textLayerWidth, textLayerHeight, columnIndex to reduce size
          }))
          const simplifiedSize = estimateSize(simplifiedHighlights)
          if (simplifiedSize < maxSize) {
            const docRef = doc(db, 'users', currentUser.uid, 'documents', documentId)
            await setDoc(docRef, {
              [field]: simplifiedHighlights
            }, { merge: true })
            console.log(`Saved simplified ${field} to Firestore (${simplifiedSize} bytes)`)
          } else {
            console.warn(`Even simplified ${field} is too large, skipping save`)
          }
          return
        }
        return
      }

      const docRef = doc(db, 'users', currentUser.uid, 'documents', documentId)
      await setDoc(docRef, {
        [field]: value
      }, { merge: true })
      console.log(`Successfully updated ${field} in Firestore (${size} bytes)`)
    } catch (error) {
      console.error(`Error updating ${field} in Firestore:`, error)
      // Don't throw - allow UI to continue functioning even if save fails
    }
  }, [documentId, currentUser])

  // Handler for saving summary text (onBlur)
  const handleSummaryBlur = useCallback(async (newSummaryText) => {
    if (newSummaryText !== summaryText) {
      setSummaryText(newSummaryText)
      await updateDocumentField('summary', newSummaryText)
    }
  }, [summaryText, updateDocumentField])

  // Handler for saving timeline (onBlur for event edits)
  const handleTimelineUpdate = useCallback(async (updatedTimeline) => {
    if (JSON.stringify(updatedTimeline) !== JSON.stringify(timeline)) {
      setTimeline(updatedTimeline)
      await updateDocumentField('timeline', updatedTimeline)
    }
  }, [timeline, updateDocumentField])

  // Handler for saving character updates (updates subcollection)
  const handleCharacterUpdate = useCallback(async (characterId, updates) => {
    if (!documentId || !currentUser) return
    
    try {
      const characterRef = doc(db, 'users', currentUser.uid, 'documents', documentId, 'characters', characterId)
      await updateDoc(characterRef, updates)
      console.log(`Successfully updated character ${characterId}`)
      
      // Update local state
      setCharacters(prev => {
        if (!prev || !prev.characters) return prev
        return {
          ...prev,
          characters: prev.characters.map(char => 
            char.id === characterId ? { ...char, ...updates } : char
          )
        }
      })
    } catch (error) {
      console.error(`Error updating character ${characterId}:`, error)
    }
  }, [documentId, currentUser])

  // Handler for saving chat history (append-and-save strategy)
  const handleChatMessage = useCallback(async (userMessage, aiResponse) => {
    const newMessages = [
      ...chatHistory,
      { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
      { role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() }
    ]
    
    setChatHistory(newMessages)
    await updateDocumentField('chatHistory', newMessages)
  }, [chatHistory, updateDocumentField])

  // Wrapper for setHighlightItems that auto-saves to Firestore
  const setHighlightItemsWithSave = useCallback((updater) => {
    setHighlightItems(prev => {
      const newItems = typeof updater === 'function' ? updater(prev) : updater
      // Auto-save to Firestore
      updateDocumentField('highlightItems', newItems).catch(err => {
        console.error('Failed to save highlight items:', err)
      })
      return newItems
    })
  }, [updateDocumentField])
  
  // Render check - moved earlier to ensure it executes
  
  // Determine what to render based on state (do this early so we can use it)
  const shouldRenderPDFReader = !!pdfDoc && !!pdfFile && !isLoading;
  const shouldRenderLoading = !pdfDoc && (isLoading || location.state?.file || location.state?.documentId);
  const shouldRedirect = !pdfDoc && !isLoading && !location.state?.file && !documentIdFromUrl && !location.state?.documentId;
  
  // Redirect to dashboard if no PDF is loaded and not processing one
  useEffect(() => {
    // Only redirect if we're not on a document route and have no file/state
    if (!pdfDoc && !isLoading && !location.state?.file && !documentIdFromUrl && !location.state?.documentId) {
      navigate('/dashboard', { replace: true })
    }
  }, [pdfDoc, isLoading, location.state, navigate, documentIdFromUrl])

  // Sidebar resize handlers
  const handleResizeStart = useCallback((e) => {
    // Always allow resizing when viewing an exhibit, otherwise only when not collapsed
    const isViewingExhibit = sidebarView === 'exhibits' && isExhibitsExpanded
    if (isSidebarCollapsed && !isViewingExhibit) return
    
    e.preventDefault()
    isResizingRef.current = true
    setIsResizing(true) // Disable CSS transition during resize
    resizeStartXRef.current = e.clientX
    
    // If collapsed and viewing exhibit, start from collapsed width
    // Otherwise use current sidebar width
    if (isSidebarCollapsed && isViewingExhibit) {
      resizeStartWidthRef.current = 52 // Collapsed width
      // Uncollapse when starting to resize from collapsed state
      setIsSidebarCollapsed(false)
    } else {
      resizeStartWidthRef.current = sidebarWidth
    }
    
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [isSidebarCollapsed, sidebarWidth, sidebarView, isExhibitsExpanded])

  const handleResizeMove = useCallback((e) => {
    if (!isResizingRef.current) return
    const deltaX = e.clientX - resizeStartXRef.current
    const isViewingExhibit = sidebarView === 'exhibits' && isExhibitsExpanded
    
    // When viewing exhibit, allow expansion up to 80vw, minimum is 220px (can shrink below 50vw)
    // When not viewing exhibit, use normal constraints
    let minWidth = 220
    let maxWidth = 500
    if (isViewingExhibit) {
      // Allow full range when viewing exhibit - user can shrink or expand as needed
      minWidth = 220
      maxWidth = Math.floor(window.innerWidth * 0.8)
    }
    
    const newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStartWidthRef.current + deltaX))
    setSidebarWidth(newWidth)
    
    // Auto-expand exhibits sidebar if resizing from collapsed state
    if (isViewingExhibit && !isExhibitsExpanded && newWidth >= 220) {
      setIsExhibitsExpanded(true)
    }
    
    // Update normal width if not on highlights tab (preserve original normal width when on highlights)
    if (sidebarView !== 'highlights') {
      normalSidebarWidthRef.current = newWidth
    }
  }, [sidebarView, isExhibitsExpanded])

  const handleResizeEnd = useCallback(() => {
    if (!isResizingRef.current) return
    isResizingRef.current = false
    setIsResizing(false) // Re-enable CSS transition after resize
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  // Add global mouse event listeners for resizing
  useEffect(() => {
    if (isMobile) return
    
    window.addEventListener('mousemove', handleResizeMove)
    window.addEventListener('mouseup', handleResizeEnd)
    
    return () => {
      window.removeEventListener('mousemove', handleResizeMove)
      window.removeEventListener('mouseup', handleResizeEnd)
    }
  }, [isMobile, handleResizeMove, handleResizeEnd])

  // Update refs when state changes
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
    isSidebarCollapsedRef.current = isSidebarCollapsed
    sidebarViewRef.current = sidebarView
  }, [sidebarWidth, isSidebarCollapsed, sidebarView])

  // Initialize previous sidebar view ref
  useEffect(() => {
    previousSidebarViewRef.current = sidebarView
  }, []) // Only run once on mount

  // Auto-expand sidebar and minimize panel when Highlight mode is activated
  useEffect(() => {
    if (isMobile || !pdfDoc) return
    
    // Read the ref value at the start (before updating it)
    const wasHighlight = previousInteractionModeRef.current === 'highlight'
    const isHighlight = interactionMode === 'highlight'
    
    // Only run expansion logic when mode actually changes, not on every render
    if (isHighlight && !wasHighlight) {
      // Highlight mode was just activated
      // Store current width as normal width if not already expanded
      const currentWidth = sidebarWidthRef.current
      if (currentWidth < 500) {
        normalSidebarWidthRef.current = currentWidth
      }
      
      // Expand sidebar if collapsed
      if (isSidebarCollapsedRef.current) {
        setIsSidebarCollapsed(false)
        // Wait a bit for collapse animation, then expand to max width
        setTimeout(() => {
          setSidebarWidth(500)
        }, 150)
      } else {
        // Animate to max width (CSS transition will handle the animation)
        setSidebarWidth(500)
      }
      
      // Switch to highlights sidebar view (only when mode first activates)
      setSidebarView('highlights')
      
      // Minimize control panel
      setIsControlsPanelMinimized(true)
    } else if (!isHighlight && wasHighlight) {
      // Highlight mode was just deactivated
      // If sidebar is showing highlights and is expanded, keep it that way
      // Only reverse expansion if NOT on highlights tab
      if (sidebarViewRef.current !== 'highlights' && sidebarWidthRef.current >= 500) {
        setSidebarWidth(normalSidebarWidthRef.current || 230)
      }
      // If on highlights tab and expanded, keep it expanded (don't change anything)
      
      // Maximize control panel (only if switching to read mode)
      if (interactionMode === 'read') {
        setIsControlsPanelMinimized(false)
      }
    }
    
    // Update previous interaction mode ref
    previousInteractionModeRef.current = interactionMode
    interactionModeRef.current = interactionMode // Keep ref in sync with state
  }, [interactionMode, isMobile, pdfDoc]) // Only depend on interactionMode to prevent interference

  // Auto-expand/collapse sidebar when switching to/from highlights view
  useEffect(() => {
    if (isMobile || !pdfDoc) return
    
    const wasHighlights = previousSidebarViewRef.current === 'highlights'
    const isHighlights = sidebarView === 'highlights'
    
    if (isHighlights && !wasHighlights) {
      // Just switched TO highlights view
      // Store current width as normal width if not already expanded
      if (sidebarWidthRef.current < 500) {
        normalSidebarWidthRef.current = sidebarWidthRef.current
      }
      
      // Expand sidebar if collapsed
      if (isSidebarCollapsedRef.current) {
        setIsSidebarCollapsed(false)
        // Wait a bit for collapse animation, then expand to max width
        setTimeout(() => {
          setSidebarWidth(500)
        }, 150)
      } else {
        // Animate to max width (CSS transition will handle the animation)
        setSidebarWidth(500)
      }
    } else if (!isHighlights && wasHighlights && sidebarWidthRef.current >= 500) {
      // Just switched AWAY from highlights view, reverse expansion
      setSidebarWidth(normalSidebarWidthRef.current || 230)
    }
    
    // Update previous sidebar view
    previousSidebarViewRef.current = sidebarView
  }, [sidebarView, isMobile, pdfDoc])

  // Auto-hide toolbar on scroll (mobile only)
  useEffect(() => {
    if (!isMobile || !pdfDoc) return

    const pdfViewer = document.querySelector('.pdf-viewer-container')
    if (!pdfViewer) return

    const handleScroll = () => {
      const currentScrollY = pdfViewer.scrollTop
      const scrollDelta = currentScrollY - lastScrollYRef.current

      // Show toolbar when scrolling up, hide when scrolling down
      if (scrollDelta < -10) {
        // Scrolling up
        setToolbarVisible(true)
      } else if (scrollDelta > 10) {
        // Scrolling down
        setToolbarVisible(false)
      }

      lastScrollYRef.current = currentScrollY

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }

      // Show toolbar after scroll stops
      scrollTimeoutRef.current = setTimeout(() => {
        setToolbarVisible(true)
      }, 2000)
    }

    pdfViewer.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      pdfViewer.removeEventListener('scroll', handleScroll)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [isMobile, pdfDoc])

  // Auto-fade mobile bottom controls after inactivity
  useEffect(() => {
    if (!isMobile || !pdfDoc) return

    const resetFadeTimer = () => {
      // Show controls at full opacity
      setMobileControlsOpacity(1)
      
      // Clear existing timeout
      if (mobileControlsTimeoutRef.current) {
        clearTimeout(mobileControlsTimeoutRef.current)
      }

      // Fade to 0.6 opacity after 3 seconds of inactivity
      mobileControlsTimeoutRef.current = setTimeout(() => {
        setMobileControlsOpacity(0.6)
      }, 3000)
    }

    // Reset timer on user interaction
    const handleInteraction = () => {
      resetFadeTimer()
    }

    // Reset timer on play/pause
    if (isPlaying) {
      resetFadeTimer()
    }

    document.addEventListener('touchstart', handleInteraction, { passive: true })
    document.addEventListener('click', handleInteraction, { passive: true })

    // Initial timer
    resetFadeTimer()

    return () => {
      document.removeEventListener('touchstart', handleInteraction)
      document.removeEventListener('click', handleInteraction)
      if (mobileControlsTimeoutRef.current) {
        clearTimeout(mobileControlsTimeoutRef.current)
      }
    }
  }, [isMobile, pdfDoc, isPlaying])

  // Close speed dropdown when clicking outside
  useEffect(() => {
    if (!speedDropdownOpen) return

    const handleClickOutside = (event) => {
      if (speedDropdownRef.current && !speedDropdownRef.current.contains(event.target)) {
        setSpeedDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [speedDropdownOpen])

  // Update current page counter based on visible page
  useEffect(() => {
    if (!pdfDoc || totalPages === 0) return

    const pdfViewer = document.querySelector('.pdf-viewer-container')
    if (!pdfViewer) return

    let updatePageTimeout = null

    const updateCurrentPage = () => {
      const scrollPos = getCurrentScrollPosition()
      if (scrollPos && scrollPos.pageNum !== null) {
        setCurrentPage(scrollPos.pageNum)
      }
    }

    const handleScroll = () => {
      // Debounce page updates to avoid excessive state updates
      if (updatePageTimeout) {
        clearTimeout(updatePageTimeout)
      }
      updatePageTimeout = setTimeout(updateCurrentPage, 100)
    }

    // Initial page update
    updateCurrentPage()

    pdfViewer.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      pdfViewer.removeEventListener('scroll', handleScroll)
      if (updatePageTimeout) {
        clearTimeout(updatePageTimeout)
      }
    }
  }, [pdfDoc, totalPages, isHighlightsExpanded, isSummaryExpanded, isTimelineExpanded, isCharactersExpanded])

  // Detect manual scrolling and disable auto-scroll when user scrolls away
  useEffect(() => {
    if (!pdfDoc) return

    const pdfViewer = document.querySelector('.pdf-viewer-container')
    if (!pdfViewer) return

    let lastScrollTop = pdfViewer.scrollTop
    let scrollTimeout = null
    let isUserScrolling = false

    const handleScroll = () => {
      const currentScrollTop = pdfViewer.scrollTop
      const scrollDelta = Math.abs(currentScrollTop - lastScrollTop)
      
      // If this is a programmatic scroll (from our code), ignore it
      if (isProgrammaticScrollRef.current) {
        lastScrollTop = currentScrollTop
        return
      }

      // If scroll happened very recently after a programmatic scroll, check scroll direction
      // Only ignore if scrolling in the same direction as programmatic scroll (momentum)
      const timeSinceProgrammaticScroll = Date.now() - lastProgrammaticScrollTimeRef.current
      const scrollDirection = currentScrollTop > lastScrollTop ? 'down' : 'up'
      
      // If it's been less than 300ms since programmatic scroll, be more lenient
      // But still disable if user is clearly scrolling in a different direction or significantly
      if (timeSinceProgrammaticScroll < 300 && scrollDelta < 20) {
        lastScrollTop = currentScrollTop
        return
      }

      // Disable auto-scroll on any scroll movement (reduced threshold for immediate response)
      if (scrollDelta > 1) {
        // Mark that user is scrolling
        isUserScrolling = true
        
        // Clear any pending timeout
        if (scrollTimeout) {
          clearTimeout(scrollTimeout)
        }
        
        // Disable auto-scroll immediately when user scrolls
        // Use ref to check and update synchronously
        if (autoScrollEnabledRef.current) {
          autoScrollEnabledRef.current = false
          setAutoScrollEnabled(false)
          // Immediately mark that we're no longer in programmatic scroll mode
          // This prevents any pending applyReadingHighlight calls from scrolling
          isProgrammaticScrollRef.current = false
          // Cancel any pending scroll operations
          if (pendingScrollTimeoutRef.current) {
            clearTimeout(pendingScrollTimeoutRef.current)
            pendingScrollTimeoutRef.current = null
          }
        }
        
        // Reset user scrolling flag after a short delay
        scrollTimeout = setTimeout(() => {
          isUserScrolling = false
        }, 100)
      }
      
      lastScrollTop = currentScrollTop
    }

    pdfViewer.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      pdfViewer.removeEventListener('scroll', handleScroll)
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }
    }
  }, [pdfDoc, autoScrollEnabled])

  // Keep hasCurrentReadingPosition in sync with playback state
  useEffect(() => {
    if (isPlaying && !hasCurrentReadingPosition) {
      // If playback is active but state says no reading position, set it to true
      // This ensures the button appears even if state got out of sync
      setHasCurrentReadingPosition(true)
    }
  }, [isPlaying, hasCurrentReadingPosition])

  useEffect(() => {
    // Check if browser supports Web Speech API
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis
    } else {
      setError('Your browser does not support text-to-speech. Please use Chrome, Edge, Safari, or Firefox.')
    }

    // Cleanup on unmount
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel()
      }
    }
  }, [])

  // Keep refs in sync with state for Media Session handlers
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    extractedTextRef.current = extractedText
  }, [extractedText])

  useEffect(() => {
    startPositionRef.current = startPosition
  }, [startPosition])

  useEffect(() => {
    pdfFileRef.current = pdfFile
  }, [pdfFile])

  useEffect(() => {
    languageRef.current = language
  }, [language])

  useEffect(() => {
    detectedLanguageRef.current = detectedLanguage
  }, [detectedLanguage])

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed
  }, [playbackSpeed])

  useEffect(() => {
    textItemsRef.current = textItems
  }, [textItems])

  // Set up Media Session API handlers once (runs only on mount)
  useEffect(() => {
    if (!('mediaSession' in navigator)) {
      console.log('Media Session API not available')
      return
    }

    console.log('Setting up Media Session API handlers (one-time setup)')
    
    // Helper function to start playback (uses refs for latest values)
    const startPlayback = async () => {
      const currentlyPlaying = isPlayingRef.current
      const currentText = extractedTextRef.current
      const currentStartPos = startPositionRef.current
      
      if (currentlyPlaying || !currentText) {
        return false
      }
      
      const position = currentStartPos
      currentPlaybackPositionRef.current = position
      playbackStartPositionRef.current = position
      playbackStartTimeRef.current = Date.now()
      lastBoundaryPositionRef.current = position

      // Determine language to use
      let langToUse = languageRef.current
      if (langToUse === 'auto') {
        langToUse = detectedLanguageRef.current || 'en'
      }
      
      const textToRead = currentText.substring(position).trim()
      
      if (!textToRead) {
        setError('No text to read from the selected position.')
        return false
      }

      // Use browser TTS for all languages
      console.log('Media Session: Starting playback, language:', langToUse, 'text length:', textToRead.length)
      console.log('Media Session: Using browser TTS for', langToUse === 'es' ? 'Spanish' : 'English', 'text')
      if (!synthRef.current) {
        setError('Text-to-speech is not available in your browser.')
        return false
      }

      // Split text into segments with header detection for browser TTS
      // Note: documentId is not available in Media Session context, so we'll use on-the-fly detection
      const segments = splitTextForBrowserTTS(textToRead, null)
      console.log(`Media Session: Split text into ${segments.length} segments, ${segments.filter(s => s.isHeader).length} headers detected`)

      let currentSegmentIndex = 0
      let totalTextOffset = 0
      
      // Function to speak next segment
      const speakNextSegment = () => {
        if (currentSegmentIndex >= segments.length) {
          // All segments done
          setIsPlaying(false)
          currentPlaybackPositionRef.current = position + textToRead.length
          playbackStartTimeRef.current = null
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused'
          }
          return
        }

        const segment = segments[currentSegmentIndex]
        if (!segment.text || segment.text.trim().length === 0) {
          currentSegmentIndex++
          speakNextSegment()
          return
        }

        // If this segment is after a header, add delay
        if (currentSegmentIndex > 0 && segments[currentSegmentIndex - 1].isHeader) {
          const delay = segments[currentSegmentIndex - 1].delay
          setTimeout(() => {
            speakNextSegment()
          }, delay)
          return
        }

        // Create utterance for this segment
        const utterance = new SpeechSynthesisUtterance(segment.text)
        utterance.lang = langToUse === 'es' ? 'es-ES' : 'en-US'
        utterance.rate = playbackSpeedRef.current
        utterance.pitch = 1.0
        utterance.volume = 1.0

        const segmentStartInText = totalTextOffset
        totalTextOffset += segment.text.length + (currentSegmentIndex < segments.length - 1 ? 1 : 0)

        utterance.onboundary = (event) => {
          if (event.name === 'word' || event.name === 'sentence') {
            const absolutePosition = position + segmentStartInText + event.charIndex
            currentPlaybackPositionRef.current = absolutePosition
            lastBoundaryPositionRef.current = absolutePosition
          }
        }

        utterance.onstart = () => {
          if (currentSegmentIndex === 0) {
            setIsPlaying(true)
            currentPlaybackPositionRef.current = position
            playbackStartPositionRef.current = position
            playbackStartTimeRef.current = Date.now()
            lastBoundaryPositionRef.current = position
            
            if ('mediaSession' in navigator) {
              navigator.mediaSession.playbackState = 'playing'
              navigator.mediaSession.metadata = new MediaMetadata({
                title: pdfFileRef.current ? pdfFileRef.current.name : 'SpeechCase',
                artist: 'Text-to-Speech',
                album: 'PDF Reader'
              })
            }
          }
        }
        
        utterance.onend = () => {
          currentSegmentIndex++
          if (segment.isHeader) {
            setTimeout(() => {
              speakNextSegment()
            }, segment.delay)
          } else {
            speakNextSegment()
          }
        }
        
        utterance.onerror = (event) => {
          // Ignore "interrupted" errors - these are expected when pausing/cancelling speech
          if (event.error === 'interrupted') {
            setIsPlaying(false)
            playbackStartTimeRef.current = null
            
            if ('mediaSession' in navigator) {
              navigator.mediaSession.playbackState = 'paused'
            }
            return
          }
          
          // Only show errors for actual problems
          setError('Error during speech: ' + event.error)
          setIsPlaying(false)
          playbackStartTimeRef.current = null
          
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused'
          }
        }

        utteranceRef.current = utterance
        synthRef.current.speak(utterance)
      }
      
      // Start speaking the first segment
      speakNextSegment()
      return true
    }

    // Helper function to pause playback
    const pausePlayback = () => {
      const currentlyPlaying = isPlayingRef.current
      
      if (currentlyPlaying) {
        // Save current playback position before canceling
        const currentPos = lastBoundaryPositionRef.current !== undefined 
          ? lastBoundaryPositionRef.current 
          : currentPlaybackPositionRef.current
        if (currentPos !== undefined) {
          // Update ref so resume will use this position
          startPositionRef.current = currentPos
        }
        
        // Handle Google TTS audio
        if (audioRef.current) {
          isCancelledRef.current = true
          audioRef.current.pause()
          audioRef.current = null
        }
        
        // Handle browser TTS
        if (synthRef.current) {
          synthRef.current.cancel()
        }
        
        setIsPlaying(false)
        isPlayingRef.current = false
        clearReadingHighlight()
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused'
        }
        return true
      }
      return false
    }
    
    navigator.mediaSession.setActionHandler('play', () => {
      console.log('Media Session play action triggered')
      startPlayback()
    })

    navigator.mediaSession.setActionHandler('pause', () => {
      console.log('Media Session pause action triggered')
      pausePlayback()
    })
    
    // Expose test function to window for manual testing from console
    // You can test by running: window.testMediaSessionPause() or window.testMediaSessionPlay()
    if (typeof window !== 'undefined') {
      window.testMediaSessionPause = () => {
        console.log('Testing Media Session pause handler...')
        console.log('Current playing state:', isPlayingRef.current)
        if ('mediaSession' in navigator && navigator.mediaSession.setActionHandler) {
          // Manually trigger the pause handler (simulating what macOS would do)
          console.log('Calling pausePlayback()...')
          const result = pausePlayback()
          console.log('pausePlayback() returned:', result)
          console.log('New playing state:', isPlayingRef.current)
          console.log('Media Session playbackState:', navigator.mediaSession.playbackState)
        } else {
          console.log('Media Session API not available')
        }
      }
      window.testMediaSessionPlay = () => {
        console.log('Testing Media Session play handler...')
        console.log('Current playing state:', isPlayingRef.current)
        console.log('Has text:', !!extractedTextRef.current)
        if ('mediaSession' in navigator && navigator.mediaSession.setActionHandler) {
          // Manually trigger the play handler (simulating what macOS would do)
          console.log('Calling startPlayback()...')
          const result = startPlayback()
          console.log('startPlayback() returned:', result)
        } else {
          console.log('Media Session API not available')
        }
      }
      console.log('Media Session test functions available: window.testMediaSessionPlay() and window.testMediaSessionPause()')
      console.log('⚠️  macOS Media Key Note: Hardware media keys may not work in Chrome on macOS due to system-level interception.')
      console.log('💡 Alternative: Press SPACEBAR to play/pause (works when not typing in input fields)')
    }
    
    return () => {
      // Clean up Media Session API handlers
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setActionHandler('play', null)
          navigator.mediaSession.setActionHandler('pause', null)
        } catch (e) {
          console.error('Error cleaning up Media Session handlers:', e)
        }
      }
    }
  }, []) // Empty dependency array - set up once on mount

  // Handle keyboard play/pause button
  useEffect(() => {
    const togglePlayPause = () => {
      // Only handle if we have text to read
      if (!extractedText) {
        setError('No text to read. Please upload a PDF first.')
        return
      }

      if (!synthRef.current) {
        setError('Text-to-speech is not available in your browser.')
        return
      }

      // Toggle play/pause
      if (isPlaying) {
        // Save current playback position before canceling
        const currentPos = lastBoundaryPositionRef.current !== undefined 
          ? lastBoundaryPositionRef.current 
          : currentPlaybackPositionRef.current
        if (currentPos !== undefined) {
          setStartPosition(currentPos)
        }
        
        // Stop any ongoing speech
        synthRef.current.cancel()
        setIsPlaying(false)
        
        // Update Media Session metadata
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused'
        }
      } else {
        // Start playback from current start position (which may have been updated when paused)
        // Use ref value (updated when pausing) and sync state
        const positionToUse = startPositionRef.current
        if (positionToUse !== startPosition) {
          setStartPosition(positionToUse)
        }
        const success = startPlaybackFromPosition(positionToUse)
        if (!success) {
          setError('No text to read from the selected position. Please click on a word in the PDF to set the start position.')
        }
      }
    }

    const handleKeyDown = (event) => {
      // Check if the play/pause media key is pressed
      // Media keys can be detected via event.code or event.key
      // On macOS, we need to check multiple properties
      const isMediaPlayPause = 
        event.code === 'MediaPlayPause' || 
        event.key === 'MediaPlayPause' ||
        event.keyCode === 179 || // Some browsers use keyCode 179 for play/pause
        (event.code === 'Space' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA' && event.target.tagName !== 'SELECT' && !event.ctrlKey && !event.metaKey && !event.altKey)
      
      if (isMediaPlayPause) {
        console.log('Media key detected via keydown event:', event.code, event.key, event.keyCode)
        // Prevent default behavior (e.g., pausing system media)
        event.preventDefault()
        event.stopPropagation()
        togglePlayPause()
      }
    }

    // Add event listeners with capture phase to catch events earlier
    document.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keydown', handleKeyDown, true)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [extractedText, isPlaying, startPosition]) // Only include essential dependencies

  // Render all PDF pages when document or scale changes
  useEffect(() => {
    if (pdfDoc && totalPages > 0) {
      initializePages()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, totalPages, pageScale])

  // Render pages when pageData or interactionMode changes
  useEffect(() => {
    if (pageData.length > 0 && pdfDoc) {
      renderPages()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageData, interactionMode])

  // Render thumbnails when PDF document is loaded
  useEffect(() => {
    if (pdfDoc && totalPages > 0) {
      renderThumbnails()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, totalPages])

  // Clear rendered thumbnails when sidebar is collapsed (canvas content is lost when hidden)
  useEffect(() => {
    if (isSidebarCollapsed || sidebarView !== 'pages') {
      setRenderedThumbnails([])
    }
  }, [isSidebarCollapsed, sidebarView])

  // Re-render thumbnails when sidebar is expanded (canvas content is lost when hidden)
  useEffect(() => {
    if (pdfDoc && totalPages > 0 && !isSidebarCollapsed && sidebarView === 'pages') {
      // Wait for DOM to be ready and sidebar content to be visible
      const timeoutId = setTimeout(() => {
        renderThumbnails()
      }, 200)
      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSidebarCollapsed, sidebarView, pdfDoc, totalPages])

  // Clear rendered pages when switching away from pages view
  useEffect(() => {
    if (sidebarView !== 'pages') {
      setRenderedPages([])
    }
  }, [sidebarView])

  // Re-render pages and thumbnails when switching back to pages view
  useEffect(() => {
    if (pdfDoc && totalPages > 0 && sidebarView === 'pages' && pageData.length > 0) {
      // Wait for DOM to be ready
      const timeoutId = setTimeout(() => {
        // Re-render PDF pages
        renderPages()
        // Re-render thumbnails if sidebar is not collapsed
        if (!isSidebarCollapsed) {
          setTimeout(() => {
            renderThumbnails()
          }, 100)
        }
      }, 200)
      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarView, isSidebarCollapsed])

  // Scroll position for timeline is now saved in the setIsTimelineExpanded handler

  // Re-render PDF pages when returning from expanded timeline view
  // Canvas content is lost when hidden, so we need to re-render when visible again
  useEffect(() => {
    if (!isTimelineExpanded && pdfDoc && totalPages > 0 && pageData.length > 0) {
      // Wait for DOM to be ready and PDF viewer to be visible
      const timeoutId = setTimeout(async () => {
        await renderPages()
        // Restore scroll position after pages are re-rendered
        if (scrollPositionBeforeFullViewRef.current) {
          // Wait for renderedPages to update and DOM to settle after rendering
          // Reduced delay for faster restoration (2x faster)
          setTimeout(() => {
            restoreScrollPositionFromFullView()
          }, 75)
        }
      }, 100)
      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimelineExpanded])

  // Note: Scroll position restoration for timeline is now handled in the useEffect
  // that calls renderPages(), after pages are re-rendered. This prevents conflicts
  // where useLayoutEffect tries to restore before pages are re-rendered.

  // Scroll position for summary is now saved in the onExpandSummary handler

  // Re-render PDF pages when returning from expanded summary view
  // Canvas content is lost when hidden, so we need to re-render when visible again
  useEffect(() => {
    if (!isSummaryExpanded && pdfDoc && totalPages > 0 && pageData.length > 0) {
      // Wait for DOM to be ready and PDF viewer to be visible
      const timeoutId = setTimeout(async () => {
        await renderPages()
        // Restore scroll position after pages are re-rendered
        if (scrollPositionBeforeFullViewRef.current) {
          // Wait for renderedPages to update and DOM to settle after rendering
          // Reduced delay for faster restoration (2x faster)
          setTimeout(() => {
            restoreScrollPositionFromFullView()
          }, 75)
        }
      }, 100)
      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSummaryExpanded])

  // Note: Scroll position restoration for summary is now handled in the useEffect
  // that calls renderPages(), after pages are re-rendered. This prevents conflicts
  // where useLayoutEffect tries to restore before pages are re-rendered.

  // Scroll position for highlights is now saved in the onExpandHighlights handler

  // Re-render PDF pages when returning from expanded highlights view
  // Canvas content is lost when hidden, so we need to re-render when visible again
  useEffect(() => {
    if (!isHighlightsExpanded && pdfDoc && totalPages > 0 && pageData.length > 0) {
      // Wait for DOM to be ready and PDF viewer to be visible
      const timeoutId = setTimeout(async () => {
        await renderPages()
        // Restore scroll position after pages are re-rendered
        if (scrollPositionBeforeFullViewRef.current) {
          // Wait for renderedPages to update and DOM to settle after rendering
          // Reduced delay for faster restoration (2x faster)
          setTimeout(() => {
            restoreScrollPositionFromFullView()
          }, 75)
        }
      }, 100)
      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHighlightsExpanded])

  // Note: Scroll position restoration for highlights is now handled in the useEffect
  // that calls renderPages(), after pages are re-rendered. This prevents conflicts
  // where useLayoutEffect tries to restore before pages are re-rendered.

  // Re-render PDF pages when returning from expanded characters view
  // Canvas content is lost when hidden, so we need to re-render when visible again
  useEffect(() => {
    if (!isCharactersExpanded && pdfDoc && totalPages > 0 && pageData.length > 0) {
      // Wait for DOM to be ready and PDF viewer to be visible
      const timeoutId = setTimeout(async () => {
        await renderPages()
        // Restore scroll position after pages are re-rendered
        if (scrollPositionBeforeFullViewRef.current) {
          // Wait for renderedPages to update and DOM to settle after rendering
          // Reduced delay for faster restoration (2x faster)
          setTimeout(() => {
            restoreScrollPositionFromFullView()
          }, 75)
        }
      }, 100)
      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCharactersExpanded])

  // Note: The fallback scroll restoration has been removed. Scroll position restoration
  // is now handled in the useEffect hooks that call renderPages(), after pages are
  // re-rendered. This prevents conflicts where the fallback tries to restore before
  // pages are re-rendered and clears the saved position.

  // Auto-scroll sidebar to keep current page visible
  useEffect(() => {
    if (currentPage > 0 && !isMobile) {
      const activeThumbnail = document.querySelector(`.thumbnail-item.active`)
      if (activeThumbnail) {
        const sidebarContent = document.querySelector('.thumbnail-sidebar-content')
        if (sidebarContent) {
          const sidebarRect = sidebarContent.getBoundingClientRect()
          const thumbnailRect = activeThumbnail.getBoundingClientRect()
          
          // Check if thumbnail is outside visible area
          if (thumbnailRect.top < sidebarRect.top) {
            activeThumbnail.scrollIntoView({ behavior: 'smooth', block: 'start' })
          } else if (thumbnailRect.bottom > sidebarRect.bottom) {
            activeThumbnail.scrollIntoView({ behavior: 'smooth', block: 'end' })
          }
        }
      }
    }
  }, [currentPage, isMobile])

  // Restore scroll position immediately when pageData is set (e.g., after zoom)
  // Use useLayoutEffect to set scroll position synchronously before browser paints
  // This prevents the visible jump to a different page
  useLayoutEffect(() => {
    if (scrollPositionBeforeZoomRef.current && pageData.length > 0) {
      const scrollPos = scrollPositionBeforeZoomRef.current
      const pdfViewer = document.querySelector('.pdf-viewer-container')
      if (!pdfViewer) return

      // Calculate target scroll position based on pageData viewport heights
      // This works even before pages are fully rendered
      // Account for padding (2rem = 32px) and gap between pages (1.5rem = 24px)
      const PAGE_GAP = 24 // 1.5rem in pixels
      const CONTAINER_PADDING = 32 // 2rem in pixels
      
      let cumulativeHeight = CONTAINER_PADDING // Start with top padding
      let targetPageData = null
      
      for (const pageInfo of pageData) {
        if (pageInfo.pageNum === scrollPos.pageNum) {
          targetPageData = pageInfo
          break
        }
        // Add height of previous page plus gap
        cumulativeHeight += pageInfo.viewport.height + PAGE_GAP
      }

      if (targetPageData) {
        // Calculate target scroll position
        const pageHeight = targetPageData.viewport.height
        const targetScrollTop = cumulativeHeight + (scrollPos.relativePosition * pageHeight) - (pdfViewer.clientHeight / 2)
        
        // Set scroll position immediately (before browser paints)
        pdfViewer.scrollTop = Math.max(0, targetScrollTop)
        
        // Mark that we've done the initial restore
        // We'll fine-tune after rendering completes
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageData.length])

  // Fine-tune scroll position after all pages are fully rendered (for zoom)
  // This ensures accuracy using actual DOM measurements
  useEffect(() => {
    if (scrollPositionBeforeZoomRef.current && pageData.length > 0 && renderedPages.length === pageData.length) {
      // Small delay to ensure all layouts are complete
      const timeoutId = setTimeout(() => {
        if (scrollPositionBeforeZoomRef.current) {
          restoreScrollPosition()
          // Clear after fine-tuning
          scrollPositionBeforeZoomRef.current = null
        }
      }, 50)
      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderedPages.length, pageData.length])

  // Re-render text layers when window is resized (to fix scaling on mobile)
  useEffect(() => {
    if (!pdfDoc || pageData.length === 0) return

    const handleResize = () => {
      // Re-render text layers to recalculate scaling
      if (pageData.length > 0) {
        renderPages()
      }
    }

    // Debounce resize events (reduced delay for faster response)
    let resizeTimeout
    const debouncedResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(handleResize, 100) // Reduced from 150ms to 100ms
    }

    window.addEventListener('resize', debouncedResize)
    window.addEventListener('orientationchange', handleResize)

    return () => {
      window.removeEventListener('resize', debouncedResize)
      window.removeEventListener('orientationchange', handleResize)
      clearTimeout(resizeTimeout)
    }
  }, [pdfDoc, pageData])

  // Helper function to normalize text for comparison (removes extra whitespace, lowercases)
  // IMPORTANT: This normalization is used for repetition detection only
  // It should NOT cause different text items to be treated as identical
  const normalizeText = (text) => {
    if (!text || typeof text !== 'string') return ''
    return text.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  // Diagnostic function to detect missing text segments
  // Compares extractedText with what's actually rendered in textItems
  // Smart filtering: identifies headers/footers by repetition across pages
  // Only filters text that appears in header/footer regions AND repeats across multiple pages
  const buildRepetitionMap = async (pdf, totalPages) => {
    const textToPages = new Map() // normalized text -> Set of page numbers
    const pageTextItems = [] // Store all text items with their page info
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.0 })
      const textContent = await page.getTextContent()
      
      const pageItems = []
      textContent.items.forEach((item, itemIndex) => {
        // Skip empty items
        if (!item.str || item.str.trim().length === 0) {
          return
        }
        
        const normalized = normalizeText(item.str)
        if (normalized.length > 0) {
          // Use a composite key to prevent false collisions: normalized text + original text length
          // This helps distinguish between text that happens to normalize to the same string
          // but is actually different (e.g., "Chapter 1" vs "Chapter 1" with different spacing)
          const compositeKey = `${normalized}|${item.str.length}`
          
          if (!textToPages.has(compositeKey)) {
            textToPages.set(compositeKey, new Set())
          }
          textToPages.get(compositeKey).add(pageNum)
          
          // Store item with position info
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
          const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3])
          const yPos = tx[5] - fontHeight
          
          pageItems.push({
            item,
            normalized: compositeKey, // Store composite key for filtering
            originalNormalized: normalized, // Keep original for logging
            yPos,
            itemIndex // Store original index for debugging
          })
        }
      })
      pageTextItems.push({ pageNum, items: pageItems, viewport })
      
    }
    
    return { textToPages, pageTextItems }
  }

  // Helper function to check if text is a common word that shouldn't be filtered
  // Common words (articles, prepositions, common verbs) are part of normal content
  // and shouldn't be filtered just because they're short or repeat across pages
  const isCommonWord = (normalizedText) => {
    if (!normalizedText || normalizedText.length === 0) return false
    
    // Common Spanish words
    const spanishCommonWords = new Set([
      'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
      'de', 'del', 'al', 'a', 'en', 'con', 'por', 'para', 'sin', 'sobre',
      'es', 'son', 'está', 'están', 'ser', 'estar', 'tener', 'haber',
      'y', 'o', 'pero', 'mas', 'más', 'muy', 'también', 'como', 'cuando',
      'se', 'le', 'les', 'lo', 'que', 'quien', 'cual', 'donde', 'cuando',
      'su', 'sus', 'mi', 'mis', 'tu', 'tus', 'nuestro', 'nuestros'
    ])
    
    // Common English words
    const englishCommonWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as',
      'and', 'or', 'but', 'if', 'when', 'where', 'what', 'who', 'why', 'how',
      'this', 'that', 'these', 'those', 'he', 'she', 'it', 'they', 'we', 'you',
      'his', 'her', 'its', 'their', 'my', 'your', 'our', 'has', 'have', 'had'
    ])
    
    const trimmed = normalizedText.trim().toLowerCase()
    return spanishCommonWords.has(trimmed) || englishCommonWords.has(trimmed)
  }

  // Sync version for immediate rendering (no LLM, fast)
  // CRITICAL: Only filters text that is BOTH in header/footer region AND repeats across pages
  // This prevents false positives from normalization collisions
  const filterHeadersAndFootersSync = (pageData, textToPages, minRepetitions = 2) => {
    const { items, viewport } = pageData
    const headerThreshold = viewport.height * 0.15 // Top 15% of page
    const footerThreshold = viewport.height * 0.80 // Bottom 20% of page
    
    const filtered = items.filter(({ item, normalized, originalNormalized, yPos }) => {
      const isInHeader = yPos <= headerThreshold
      const isInFooter = yPos >= footerThreshold
      const isInHeaderFooterRegion = isInHeader || isInFooter
      
      // Always keep text that's NOT in header/footer regions
      if (!isInHeaderFooterRegion) {
        return true
      }
      
      // For text in header/footer regions, check if it repeats
      // Use the composite key (normalized) for lookup, or fall back to simple normalized if composite key format not used
      const lookupKey = normalized.includes('|') ? normalized : normalizeText(item.str) + '|' + item.str.length
      const pagesWithThisText = textToPages.get(lookupKey)
      const repetitionCount = pagesWithThisText ? pagesWithThisText.size : 0
      
      // Get normalized text length (extract from composite key if needed)
      let normalizedLength
      let normalizedTextOnly
      if (originalNormalized) {
        normalizedTextOnly = originalNormalized
        normalizedLength = originalNormalized.length
      } else if (normalized.includes('|')) {
        normalizedTextOnly = normalized.split('|')[0]
        normalizedLength = normalizedTextOnly.length
      } else {
        normalizedTextOnly = normalized
        normalizedLength = normalized.length
      }
      
      // Check if this is a common word that shouldn't be filtered
      const isCommon = isCommonWord(normalizedTextOnly)
      
      // Filter if:
      // 1. Text appears on multiple pages (likely header/footer) AND it's NOT a common word, OR
      // 2. Text is very short (1-3 chars) and in header/footer region AND it's NOT a common word (likely page numbers, dates)
      // Common words are kept even if they repeat or are short, as they're part of normal content
      const isLikelyHeaderFooter = (repetitionCount >= minRepetitions && !isCommon) || 
                                 (normalizedLength <= 3 && isInHeaderFooterRegion && !isCommon)
      
      return !isLikelyHeaderFooter
    }).map(({ item }) => item)
    
    // Debug: Log if significant filtering occurred
    if (items.length - filtered.length > 0) {
      console.log(`[Filter] Page ${pageData.pageNum || 'unknown'}: Filtered ${items.length - filtered.length} of ${items.length} items`)
    }
    
    return filtered
  }

  // Async version (for background processing) - now uses only repetition-based filtering
  const filterHeadersAndFootersWithLLM = async (pageData, textToPages, minRepetitions = 2) => {
    // Use sync version directly (LLM version not implemented)
    return filterHeadersAndFootersSync(pageData, textToPages, minRepetitions)
  }

  // Simple language detection based on common Spanish characters and words
  const detectLanguage = (text) => {
    if (!text || text.length < 50) return 'en'
    
    const sample = text.substring(0, 1000).toLowerCase()
    
    const spanishIndicators = [
      /\b(el|la|los|las|un|una|es|son|está|están|con|por|para|que|de|del|en|a|al)\b/g,
      /[áéíóúñü]/g,
      /\b(y|o|pero|más|muy|también|como|cuando|donde|qué|quién|cómo|por qué)\b/g
    ]
    
    const englishIndicators = [
      /\b(the|a|an|is|are|was|were|with|for|that|this|and|or|but|more|very|also|how|when|where|what|who|why)\b/g,
      /\b[aeiou]{2,}/g
    ]
    
    let spanishScore = 0
    let englishScore = 0
    
    spanishIndicators.forEach(regex => {
      const matches = sample.match(regex)
      if (matches) spanishScore += matches.length
    })
    
    englishIndicators.forEach(regex => {
      const matches = sample.match(regex)
      if (matches) englishScore += matches.length
    })
    
    const accentedChars = (sample.match(/[áéíóúñüÁÉÍÓÚÑÜ]/g) || []).length
    spanishScore += accentedChars * 2
    
    return spanishScore > englishScore ? 'es' : 'en'
  }

  // Client-side header detection (simplified version for browser TTS)
  // This is a lightweight version that works in the browser
  const detectHeaderClient = (text, followingText = '') => {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return { isHeader: false, confidence: 0 };
    }

    const trimmed = text.trim();
    let confidence = 0;

    // Count words and capitalized words
    const words = trimmed.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const capitalizedCount = words.filter(w => {
      const cleanWord = w.replace(/[^\w]/g, '');
      return cleanWord.length > 0 && /^[A-Z]/.test(cleanWord);
    }).length;
    const capitalizedRatio = wordCount > 0 ? capitalizedCount / wordCount : 0;

    // Signal A: Title-case detection
    if (capitalizedRatio >= 0.5 && wordCount > 1) {
      confidence += 0.25;
    } else if (capitalizedRatio >= 0.3 && wordCount > 1) {
      confidence += 0.15;
    }
    if (capitalizedRatio >= 0.6 && !/[.!?]$/.test(trimmed)) {
      confidence += 0.1;
    }

    // Signal B: Punctuation
    const lastChar = trimmed[trimmed.length - 1];
    const hasEndingPunctuation = /[.!?,]/.test(lastChar);
    const endsWithColon = lastChar === ':';
    
    if (!hasEndingPunctuation) {
      confidence += 0.2;
    } else if (endsWithColon) {
      confidence += 0.15;
    } else {
      confidence -= 0.2;
    }

    // Signal C: Length
    if (wordCount >= 2 && wordCount <= 15) {
      confidence += 0.15;
    } else if (wordCount === 1) {
      confidence += 0.05;
    } else if (wordCount > 15) {
      confidence -= 0.15;
    }

    // Signal D: Following text
    if (followingText && followingText.trim().length > 0) {
      const firstWord = followingText.trim().split(/\s+/)[0];
      if (firstWord && /^[A-Z]/.test(firstWord.replace(/[^\w]/g, ''))) {
        confidence += 0.15;
      }
    }

    // Signal E: No verbs (simplified check)
    const commonVerbs = /\b(is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|can|could|should|may|might|get|got|go|went|make|made|take|took|see|saw|say|said|come|came|know|knew|think|thought|want|wanted|use|used|find|found|give|gave|tell|told|work|worked|call|called|try|tried|ask|asked|need|needed|feel|felt|become|became|leave|left|put|mean|meant|keep|kept|let|begin|began|seem|seemed|help|helped|show|showed|hear|heard|play|played|run|ran|move|moved|live|lived|believe|believed|bring|brought|happen|happened|write|wrote|sit|sat|stand|stood|lose|lost|pay|paid|meet|met|include|included|continue|continued|learn|learned|change|changed|lead|led|understand|understood|watch|watched|follow|followed|stop|stopped|create|created|speak|spoke|read|spend|spent|grow|grew|open|opened|walk|walked|win|won|offer|offered|remember|remembered|love|loved|consider|considered|appear|appeared|buy|bought|wait|waited|serve|served|die|died|send|sent|build|built|stay|stayed|fall|fell|cut|reach|reached|kill|killed|raise|raised|pass|passed|sell|sold|decide|decided|return|returned|explain|explained|develop|developed|carry|carried|break|broke|receive|received|agree|agreed|support|supported|hit|produce|produced|eat|ate|cover|covered|catch|caught|draw|drew|choose|chose)\b/i;
    const hasVerbs = commonVerbs.test(trimmed.toLowerCase());
    
    if (!hasVerbs && wordCount > 1) {
      confidence += 0.2;
    } else if (hasVerbs && wordCount > 3) {
      confidence -= 0.2;
    }

    confidence = Math.max(0, Math.min(1, confidence));
    return { isHeader: confidence >= 0.4, confidence };
  }

  // Split text into segments with header detection for browser TTS
  // Returns array of { text, isHeader, delay }
  const splitTextForBrowserTTS = (text, documentId = null) => {
    if (!text || typeof text !== 'string') {
      return [{ text: '', isHeader: false, delay: 0 }];
    }

    // First, split by sentence endings and double newlines
    let parts = text.split(/(?<=[.!?])\s+|(?<=\n\n)/);
    
    // Further split parts that might contain headers (short title-case phrase followed by capitalized sentence)
    const refinedParts = [];
    for (const part of parts) {
      if (!part.trim()) continue;
      
      // Look for pattern: short phrase (2-15 words, mostly title case, no ending punctuation)
      // followed by space and a capitalized sentence start
      // Try to find the BEST boundary where a header might end (prefer longer matches)
      const words = part.split(/\s+/);
      
      // Check each potential split point, but start from longest and work backwards
      // This ensures we find "Drivers of Value Capture" before "Drivers of"
      // Also check single-word headers (like "Competition")
      // Prefer longer matches when confidence is similar (within 0.15)
      let bestSplit = null;
      let bestConfidence = 0;
      let bestWordCount = 0;
      
      // Check from 15 words down to 1 word (to catch single-word headers like "Competition")
      for (let wordCount = Math.min(15, words.length - 1); wordCount >= 1; wordCount--) {
        const potentialHeader = words.slice(0, wordCount).join(' ');
        const rest = words.slice(wordCount).join(' ');
        
        if (rest.length === 0) continue;
        
        // Check if potential header looks like a header and rest starts with capitalized word
        const restFirstWord = rest.trim().split(/\s+/)[0];
        if (!restFirstWord || !/^[A-Z]/.test(restFirstWord.replace(/[^\w]/g, ''))) {
          continue; // Rest doesn't start with capital, not a good split point
        }
        
        // Check if potential header is actually a header
        const detection = detectHeaderClient(potentialHeader, rest.trim().substring(0, 100));
        
        // For single-word headers, require higher confidence (0.5) to avoid false positives
        // For multi-word headers, 0.4 is sufficient
        const minConfidence = wordCount === 1 ? 0.5 : 0.4;
        
        if (detection.isHeader && detection.confidence >= minConfidence) {
          // Prefer longer matches when confidence is similar (within 0.15)
          // This ensures "Drivers of Value Capture" is chosen over "Drivers of Value"
          const isBetter = detection.confidence > bestConfidence + 0.15 || 
                          (detection.confidence >= bestConfidence - 0.15 && wordCount > bestWordCount);
          
          if (isBetter) {
            bestSplit = {
              header: potentialHeader.trim(),
              rest: rest.trim(),
              confidence: detection.confidence
            };
            bestConfidence = detection.confidence;
            bestWordCount = wordCount;
          }
        }
      }
      
      // If we found a good header split (confidence >= 0.4)
      if (bestSplit && bestConfidence >= 0.4) {
        refinedParts.push(bestSplit.header);
        if (bestSplit.rest.length > 0) {
          refinedParts.push(bestSplit.rest);
        }
      } else {
        // No good header boundary found, keep the part as-is
        refinedParts.push(part.trim());
      }
    }
    
    // Filter out empty parts
    parts = refinedParts.filter(p => p && p.trim().length > 0);
    
    const segments = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (part.length === 0) continue;
      
      // Check first 200 chars for header detection
      const partToCheck = part.substring(0, 200);
      const followingText = i < parts.length - 1 ? parts[i + 1].trim().substring(0, 100) : '';
      
      const detection = detectHeaderClient(partToCheck, followingText);
      
      segments.push({
        text: part,
        isHeader: detection.isHeader,
        delay: detection.isHeader ? 500 : 0 // 500ms pause after headers
      });
    }
    
    return segments;
  }

  // Function to call Google TTS API for Spanish text
  const synthesizeGoogleTTS = async (text, rate = 1.0, documentId = null) => {
    try {
      console.log('Calling Google TTS API with text length:', text.length, 'rate:', rate, 'documentId:', documentId)
      const generateTts = httpsCallable(functions, 'generateTts')
      const result = await generateTts({ text, voiceId: 'en-US-Standard-C' })

      const data = result.data
      if (data.audioChunks) {
        console.log('Google TTS API success, received', data.audioChunks.length, 'audio chunks')
      } else {
        console.log('Google TTS API success, audio length:', data.audioContent?.length)
      }
      return data
    } catch (error) {
      console.error('Google TTS error:', error)
      // Handle Firebase-specific errors
      if (error.code) {
        throw new Error(`Firebase error: ${error.message}`)
      }
      throw error
    }
  }

  // Helper function to fully stop Google TTS audio
  const stopGoogleTTSAudio = async () => {
    if (audioRef.current) {
      // Set cancellation flag FIRST to prevent any new chunks from starting
      isCancelledRef.current = true
      const audio = audioRef.current
      
      // Stop the audio completely
      try {
        // Pause the audio immediately
        audio.pause()
        // Wait a moment to ensure pause takes effect
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Clear the source to stop playback
        audio.src = ''
        audio.srcObject = null
        // Reset the audio element
        audio.load()
        // Set currentTime to 0 to ensure it's fully stopped
        audio.currentTime = 0
      } catch (e) {
        console.error('Error stopping audio:', e)
      }
      
      // Clear the ref immediately to prevent any new operations on it
      audioRef.current = null
      
      // Reset state
      isPlayingRef.current = false
      setIsPlaying(false)
      
      // Wait a bit more to ensure all async operations have completed
      await new Promise(resolve => setTimeout(resolve, 100))
      
      return true
    }
    return false
  }

  // Function to play Google TTS audio
  const playGoogleTTSAudio = async (text, startPosition, rate = 1.0) => {
    // Prevent duplicate calls - check both ref and actual audio element
    // IMPORTANT: Always stop any existing audio first to prevent overlapping playback
    if (audioRef.current || isPlayingRef.current) {
      console.log('Playback already in progress, stopping existing audio first')
      // Always stop existing audio before starting new playback
      await stopGoogleTTSAudio()
      // Wait a bit more to ensure everything is fully stopped
      await new Promise(resolve => setTimeout(resolve, 150))
    }

    try {
      // Double-check that audio is stopped before proceeding
      if (audioRef.current) {
        await stopGoogleTTSAudio()
      }

      // Reset cancellation flag
      isCancelledRef.current = false
      currentChunkIndexRef.current = 0

      // Store text and position for tracking
      googleTtsTextRef.current = text
      googleTtsStartPositionRef.current = startPosition

      // Show loading state immediately
      setIsPlaying(true)
      isPlayingRef.current = true // Update ref immediately

      // Check if we need to split into chunks
      const textBytes = new TextEncoder().encode(text).length
      const maxBytes = 4500

      if (textBytes <= maxBytes) {
        // Single chunk - play directly
        setIsTTSLoading(true)
        const response = await synthesizeGoogleTTS(text, rate, documentId)
        setIsTTSLoading(false)
        const { audioContent, mimeType } = response

        const audio = new Audio(`data:${mimeType};base64,${audioContent}`)
        audio.playbackRate = rate
        audioRef.current = audio

          // Track position with improved accuracy - use direct position calculation
          let lastHighlightedPosition = null
          let hasStartedHighlighting = false // Prevent highlighting ahead before audio actually starts
          let lastUpdateTime = 0 // Track when we last updated to limit advancement rate
          const updatePosition = () => {
            if (audio.currentTime && audio.duration && !isCancelledRef.current) {
              // CRITICAL: Don't highlight if audio hasn't actually started (currentTime too small)
              // This prevents highlighting from getting ahead when clicking to start
              // Increased threshold to 0.3 seconds to ensure TTS is actually speaking
              if (audio.currentTime < 0.3) {
                // Audio just started - wait longer before highlighting to ensure TTS is actually speaking
                if (!hasStartedHighlighting) {
                  return
                }
              } else {
                hasStartedHighlighting = true
              }
              
              const progress = Math.min(1, Math.max(0, audio.currentTime / audio.duration))
              const textLength = text.length
              
              // Use direct position calculation based on audio progress
              // No offset - we want to track exactly where the audio is
              let estimatedPosition = Math.min(
                startPosition + (progress * textLength),
                startPosition + textLength - 1
              )
              
              // CRITICAL: Be more conservative at the start - don't advance too quickly
              // Linear progress can be inaccurate, especially early in playback
              if (audio.currentTime < 1.0) {
                // In first second, be very conservative - reduce progress by 30% to prevent getting ahead
                const conservativeProgress = progress * 0.7
                estimatedPosition = Math.min(
                  startPosition + (conservativeProgress * textLength),
                  startPosition + textLength - 1
                )
              }
              
              // Clamp to valid range
              let clampedPosition = Math.max(0, Math.min(estimatedPosition, extractedText.length - 1))
              
              // CRITICAL: Limit maximum advancement per update cycle to prevent getting ahead
              // This prevents the highlight from jumping forward too quickly
              if (lastValidHighlightPositionRef.current !== null) {
                const timeSinceLastUpdate = audio.currentTime - lastUpdateTime
                lastUpdateTime = audio.currentTime
                
                // Calculate maximum allowed advancement based on time elapsed
                // Assume average reading speed of ~150 words/min = ~750 chars/min = ~12.5 chars/sec
                // But be more conservative - limit to 8 chars per 100ms update (80 chars/sec max)
                const maxAdvancementPerUpdate = Math.max(5, Math.min(50, timeSinceLastUpdate * 80))
                const positionDiff = clampedPosition - lastValidHighlightPositionRef.current
                
                if (positionDiff > maxAdvancementPerUpdate) {
                  // Position advanced too quickly - cap it to prevent getting ahead
                  clampedPosition = lastValidHighlightPositionRef.current + maxAdvancementPerUpdate
                  console.log('[Google TTS] Capped position advancement', {
                    estimated: estimatedPosition,
                    capped: clampedPosition,
                    lastValid: lastValidHighlightPositionRef.current,
                    timeSinceLastUpdate,
                    maxAdvancement: maxAdvancementPerUpdate
                  })
                }
              } else {
                lastUpdateTime = audio.currentTime
              }
              
              // CRITICAL: Add page-based validation to prevent cross-page jumps
              const currentPage = currentReadingPageRef.current
              if (currentPage !== null && lastValidHighlightPositionRef.current !== null) {
                // Get the page of the new position
                const currentTextItems = textItemsRef.current
                if (currentTextItems && currentTextItems.length > 0) {
                  const potentialItems = currentTextItems.filter(item => {
                    if (!item.element || !item.str || !item.element.isConnected) return false
                    return item.charIndex <= clampedPosition && item.charIndex + item.str.length >= clampedPosition
                  })
                  if (potentialItems.length > 0) {
                    const newPage = getElementPageNumber(potentialItems[0].element)
                    // Reject if jumping to a different page unless we're at a boundary
                    if (newPage !== null && newPage !== currentPage) {
                      // Check if we're at a page boundary
                      const lastPageItems = currentTextItems.filter(item => {
                        const page = getElementPageNumber(item.element)
                        return page === currentPage
                      })
                      if (lastPageItems.length > 0) {
                        const maxCharIndexOnLastPage = Math.max(...lastPageItems.map(i => i.charIndex + (i.str?.length || 0)))
                        const isAtBoundary = clampedPosition >= maxCharIndexOnLastPage - 50
                        if (!isAtBoundary || newPage !== currentPage + 1) {
                          // Not at boundary or jumping to non-adjacent page - reject
                          console.warn('[Google TTS] Rejected cross-page jump', {
                            currentPage,
                            newPage,
                            clampedPosition,
                            lastValidPosition: lastValidHighlightPositionRef.current,
                            isAtBoundary
                          })
                          return
                        }
                      }
                    }
                  }
                }
              }
              
              // Validate position change is reasonable (prevent huge jumps)
              if (lastValidHighlightPositionRef.current !== null) {
                const positionDiff = clampedPosition - lastValidHighlightPositionRef.current
                // If this is a huge forward jump (more than 200 chars), it might be inaccurate
                // Only allow if it's clearly progressing forward and not a jump to wrong page
                if (positionDiff > 200) {
                  // Check if this is a legitimate large jump (e.g., fast speech or chunk boundary)
                  // Allow if we're clearly progressing and haven't jumped backwards recently
                  if (lastHighlightedPosition !== null && clampedPosition < lastHighlightedPosition) {
                    // Position went backwards - reject
                    return
                  }
                  // For very large jumps, be more conservative - only update if it's clearly progressing
                  if (positionDiff > textLength * 0.3) {
                    // Suspiciously large jump - might be wrong, use last known good position
                    clampedPosition = lastValidHighlightPositionRef.current
                  }
                }
              }
              
              currentPlaybackPositionRef.current = clampedPosition
              lastBoundaryPositionRef.current = clampedPosition

              // Always update highlight - use position directly (same as blue highlight)
              // This ensures the highlight follows the audio precisely
              lastHighlightedPosition = clampedPosition
              // Use the position directly to find the element (same logic as blue highlight)
              highlightCurrentReading(clampedPosition)
            }
          }

        // Use timeupdate for frequent position updates (fires ~4 times per second)
        // Also use a more frequent interval to ensure we catch all position changes
        audio.addEventListener('timeupdate', updatePosition)
        
        // Add a more frequent update interval (every 100ms) to ensure smooth highlighting
        const updateInterval = setInterval(() => {
          if (audio && !audio.paused && !audio.ended && !isCancelledRef.current) {
            updatePosition()
          } else {
            clearInterval(updateInterval)
          }
        }, 100)
        
        // Clean up interval when audio ends or is cancelled
        audio.addEventListener('ended', () => clearInterval(updateInterval))
        audio.addEventListener('pause', () => clearInterval(updateInterval))

        audio.addEventListener('play', () => {
          currentPlaybackPositionRef.current = startPosition
          playbackStartPositionRef.current = startPosition
          playbackStartTimeRef.current = Date.now()
          lastBoundaryPositionRef.current = startPosition
          previousBoundaryPositionRef.current = startPosition
          
          // Reset page tracking when starting new playback
          currentReadingPageRef.current = null
          // CRITICAL: Initialize lastValidHighlightPositionRef to startPosition to prevent initial jump
          // This ensures the first update doesn't jump ahead
          lastValidHighlightPositionRef.current = startPosition
          lastHighlightedCharIndexRef.current = null
          lastHighlightedElementRef.current = null
          
          // CRITICAL: Don't highlight immediately - wait for timeupdate to ensure audio is actually playing
          // This prevents highlighting from getting ahead when clicking to start
          // The timeupdate handler will highlight once audio.currentTime >= 0.3

          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing'
            navigator.mediaSession.metadata = new MediaMetadata({
              title: pdfFile ? pdfFile.name : 'SpeechCase',
              artist: 'Text-to-Speech (Google)',
              album: 'PDF Reader'
            })
          }
        })

        audio.addEventListener('ended', () => {
          setIsPlaying(false)
          isPlayingRef.current = false
          currentPlaybackPositionRef.current = startPosition + text.length
          playbackStartTimeRef.current = null
          clearReadingHighlight()

          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused'
          }

          audioRef.current = null
        })

        audio.addEventListener('error', (event) => {
          console.error('Audio playback error:', event)
          setError('Error playing audio: ' + (event.message || 'Unknown error'))
          setIsPlaying(false)
          isPlayingRef.current = false
          playbackStartTimeRef.current = null
          clearReadingHighlight()

          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused'
          }

          audioRef.current = null
        })

        await audio.play()
        return true
      } else {
        // Multiple chunks - use smart chunking for immediate start
        console.log(`Text is ${textBytes} bytes, using smart chunking for immediate playback...`)
        
        // Create a longer first chunk (~600-900 chars) to give time for second chunk to preload
        const getFirstChunk = (text) => {
          // Try to find 2-3 sentences (about 600-900 chars) for first chunk
          // This gives enough time for second chunk to preload while first plays
          let targetLength = 600
          let currentPos = 0
          let sentenceCount = 0
          
          // Find sentences until we reach target length or 3 sentences
          while (currentPos < text.length && sentenceCount < 3) {
            const nextSentenceEnd = text.substring(currentPos).search(/[.!?]\s+/)
            if (nextSentenceEnd > 0) {
              currentPos += nextSentenceEnd + 1
              sentenceCount++
              // If we've found at least 2 sentences and are past 600 chars, stop
              if (sentenceCount >= 2 && currentPos >= targetLength) {
                break
              }
            } else {
              break
            }
          }
          
          // If we found sentences, use them
          if (currentPos > 0 && currentPos < text.length) {
            return text.substring(0, currentPos).trim()
          }
          
          // Fallback: take first 600 characters (or up to first space after 600)
          if (text.length > 600) {
            const spaceAfter600 = text.indexOf(' ', 600)
            return spaceAfter600 > 0 ? text.substring(0, spaceAfter600) : text.substring(0, 600)
          }
          return text
        }

        const firstChunkText = getFirstChunk(text)
        const remainingText = text.substring(firstChunkText.length).trim()
        
        console.log(`First chunk: ${firstChunkText.length} chars, remaining: ${remainingText.length} chars`)

        // Get all chunks first (including remaining text chunks)
        // Client-side chunking: split text into chunks of ~4500 bytes
        let remainingChunks = []
        if (remainingText.length > 0) {
          try {
            // Simple client-side chunking: split by sentences, respecting byte limit
            const maxBytes = 4500
            const chunks = []
            let currentChunk = ''
            
            // Split by sentences first
            const sentences = remainingText.split(/([.!?]+\s+)/).filter(s => s.trim().length > 0)
            
            for (const sentence of sentences) {
              const sentenceBytes = new TextEncoder().encode(sentence).length
              const currentChunkBytes = new TextEncoder().encode(currentChunk).length
              
              if (currentChunkBytes + sentenceBytes > maxBytes && currentChunk.length > 0) {
                chunks.push(currentChunk.trim())
                currentChunk = sentence
              } else {
                currentChunk += sentence
              }
            }
            
            if (currentChunk.trim().length > 0) {
              chunks.push(currentChunk.trim())
            }
            
            remainingChunks = chunks.length > 0 ? chunks : [remainingText]
            console.log(`Remaining text split into ${remainingChunks.length} chunks`)
          } catch (err) {
            console.error('Error chunking remaining text:', err)
            remainingChunks = [remainingText] // Fallback: treat remaining as one chunk
          }
        }

        const allChunks = [firstChunkText, ...remainingChunks]
        console.log(`Total chunks to play: ${allChunks.length}`)

        // Show loading indicator
        setIsTTSLoading(true)

        // Preload cache for chunks - start preloading ALL chunks in parallel immediately
        const chunkCache = new Map()
        
        // Function to preload a chunk
        const preloadChunk = async (chunkIndex) => {
          if (chunkIndex >= allChunks.length || chunkCache.has(chunkIndex)) {
            return
          }
          
          try {
            console.log(`Preloading chunk ${chunkIndex + 1} of ${allChunks.length}`)
            const response = await synthesizeGoogleTTS(allChunks[chunkIndex], rate, documentId)
            chunkCache.set(chunkIndex, response)
            console.log(`Chunk ${chunkIndex + 1} preloaded and cached`)
          } catch (err) {
            console.error(`Error preloading chunk ${chunkIndex + 1}:`, err)
          }
        }

        // Start preloading first chunk immediately - this is what we'll play first
        // Then we'll preload subsequent chunks one at a time while playing
        setIsTTSLoading(true)
        await preloadChunk(0)
        setIsTTSLoading(false)
        
        const firstResponse = chunkCache.get(0)
        const { audioContent: firstAudioContent, mimeType } = firstResponse
        
        // Start preloading chunk 1 in background while chunk 0 plays
        if (allChunks.length > 1) {
          preloadChunk(1).catch(err => console.error('Error preloading chunk 1:', err))
        }

        // Function to play a chunk
        const playChunk = async (chunkIndex) => {
          if (isCancelledRef.current) {
            return Promise.resolve()
          }

          // Wait for chunk to be ready (should already be preloaded, but wait if not)
          let response
          if (chunkCache.has(chunkIndex)) {
            console.log(`Using cached chunk ${chunkIndex + 1}`)
            response = chunkCache.get(chunkIndex)
          } else {
            // Chunk not ready yet - wait for it (shouldn't happen with proper preloading)
            console.log(`Chunk ${chunkIndex + 1} not cached yet, loading now...`)
            setIsTTSLoading(true)
            await preloadChunk(chunkIndex)
            response = chunkCache.get(chunkIndex)
            setIsTTSLoading(false)
          }
          
          // Start preloading next chunk while this one is playing
          if (chunkIndex + 1 < allChunks.length && !chunkCache.has(chunkIndex + 1)) {
            preloadChunk(chunkIndex + 1).catch(err => 
              console.error(`Error preloading chunk ${chunkIndex + 2}:`, err)
            )
          }
          
          const { audioContent, mimeType: chunkMimeType } = response

          // Double-check cancellation before creating audio (might have been cancelled while waiting)
          if (isCancelledRef.current) {
            return Promise.resolve()
          }

          const audio = new Audio(`data:${chunkMimeType};base64,${audioContent}`)
          audio.playbackRate = rate
          
          // Final check before assigning - if cancelled now, don't start
          if (isCancelledRef.current) {
            // Clean up the audio element we just created
            audio.pause()
            audio.src = ''
            return Promise.resolve()
          }
          
          // Double-check that audioRef is still null or is the previous chunk (might have been set by another playback)
          // Allow transition from previous chunk to next chunk
          if (audioRef.current && audioRef.current !== audio) {
            // Only cancel if it's a different playback session, not a chunk transition
            // Check if the previous audio is still playing (if it is, this might be a duplicate call)
            const previousAudio = audioRef.current
            if (previousAudio && !previousAudio.paused && previousAudio.currentTime < previousAudio.duration - 0.1) {
              console.log('Audio ref already set to a different playing audio, cancelling this chunk')
              audio.pause()
              audio.src = ''
              return Promise.resolve()
            }
            // Previous audio has ended, safe to replace
            console.log('Replacing previous audio with next chunk')
          }
          
          audioRef.current = audio

          // Calculate text position for this chunk
          // For first chunk, use its actual length; for others, estimate based on remaining text
          let chunkStartPosition
          if (chunkIndex === 0) {
            chunkStartPosition = startPosition
          } else {
            // Calculate cumulative position based on actual chunk lengths
            let cumulativeLength = firstChunkText.length
            for (let i = 1; i < chunkIndex; i++) {
              cumulativeLength += allChunks[i].length
            }
            chunkStartPosition = startPosition + cumulativeLength
          }
          const chunkTextLength = allChunks[chunkIndex].length

          // Track position with improved accuracy for chunks - use direct position calculation
          let lastHighlightedPosition = null
          let hasStartedHighlighting = false // Prevent highlighting ahead before audio actually starts
          let lastUpdateTime = 0 // Track when we last updated to limit advancement rate
          const updatePosition = () => {
            if (audio.currentTime && audio.duration && !isCancelledRef.current) {
              // CRITICAL: Don't highlight if audio hasn't actually started (currentTime too small)
              // This prevents highlighting from getting ahead when clicking to start
              // Increased threshold to 0.3 seconds to ensure TTS is actually speaking
              if (audio.currentTime < 0.3) {
                // Audio just started - wait longer before highlighting to ensure TTS is actually speaking
                if (!hasStartedHighlighting) {
                  return
                }
              } else {
                hasStartedHighlighting = true
              }
              
              const progress = Math.min(1, Math.max(0, audio.currentTime / audio.duration))
              const chunkEndPosition = chunkIndex < allChunks.length - 1
                ? chunkStartPosition + chunkTextLength
                : Math.min(startPosition + text.length, extractedText.length)
              
              // Use direct position calculation based on audio progress
              // No offset - we want to track exactly where the audio is
              let positionInChunk = progress * chunkTextLength
              
              // CRITICAL: Be more conservative at the start - don't advance too quickly
              // Linear progress can be inaccurate, especially early in playback
              if (audio.currentTime < 1.0) {
                // In first second, be very conservative - reduce progress by 30% to prevent getting ahead
                const conservativeProgress = progress * 0.7
                positionInChunk = conservativeProgress * chunkTextLength
              }
              
              let estimatedPosition = Math.min(
                chunkStartPosition + positionInChunk,
                chunkEndPosition - 1
              )
              
              // Clamp to valid range in extracted text
              let clampedPosition = Math.max(0, Math.min(estimatedPosition, extractedText.length - 1))
              
              // CRITICAL: Limit maximum advancement per update cycle to prevent getting ahead
              // This prevents the highlight from jumping forward too quickly
              if (lastValidHighlightPositionRef.current !== null) {
                const timeSinceLastUpdate = audio.currentTime - lastUpdateTime
                lastUpdateTime = audio.currentTime
                
                // Calculate maximum allowed advancement based on time elapsed
                // Assume average reading speed of ~150 words/min = ~750 chars/min = ~12.5 chars/sec
                // But be more conservative - limit to 8 chars per 100ms update (80 chars/sec max)
                const maxAdvancementPerUpdate = Math.max(5, Math.min(50, timeSinceLastUpdate * 80))
                const positionDiff = clampedPosition - lastValidHighlightPositionRef.current
                
                if (positionDiff > maxAdvancementPerUpdate) {
                  // Position advanced too quickly - cap it to prevent getting ahead
                  clampedPosition = lastValidHighlightPositionRef.current + maxAdvancementPerUpdate
                  console.log('[Google TTS Chunk] Capped position advancement', {
                    estimated: estimatedPosition,
                    capped: clampedPosition,
                    lastValid: lastValidHighlightPositionRef.current,
                    timeSinceLastUpdate,
                    maxAdvancement: maxAdvancementPerUpdate
                  })
                }
              } else {
                lastUpdateTime = audio.currentTime
              }
              
              // CRITICAL: Add page-based validation to prevent cross-page jumps
              const currentPage = currentReadingPageRef.current
              if (currentPage !== null && lastValidHighlightPositionRef.current !== null) {
                // Get the page of the new position
                const currentTextItems = textItemsRef.current
                if (currentTextItems && currentTextItems.length > 0) {
                  const potentialItems = currentTextItems.filter(item => {
                    if (!item.element || !item.str || !item.element.isConnected) return false
                    return item.charIndex <= clampedPosition && item.charIndex + item.str.length >= clampedPosition
                  })
                  if (potentialItems.length > 0) {
                    const newPage = getElementPageNumber(potentialItems[0].element)
                    // Reject if jumping to a different page unless we're at a boundary
                    if (newPage !== null && newPage !== currentPage) {
                      // Check if we're at a page boundary
                      const lastPageItems = currentTextItems.filter(item => {
                        const page = getElementPageNumber(item.element)
                        return page === currentPage
                      })
                      if (lastPageItems.length > 0) {
                        const maxCharIndexOnLastPage = Math.max(...lastPageItems.map(i => i.charIndex + (i.str?.length || 0)))
                        const isAtBoundary = clampedPosition >= maxCharIndexOnLastPage - 50
                        if (!isAtBoundary || newPage !== currentPage + 1) {
                          // Not at boundary or jumping to non-adjacent page - reject
                          console.warn('[Google TTS Chunk] Rejected cross-page jump', {
                            currentPage,
                            newPage,
                            clampedPosition,
                            lastValidPosition: lastValidHighlightPositionRef.current,
                            isAtBoundary
                          })
                          return
                        }
                      }
                    }
                  }
                }
              }
              
              // Validate position change is reasonable (prevent huge jumps)
              if (lastValidHighlightPositionRef.current !== null) {
                const positionDiff = clampedPosition - lastValidHighlightPositionRef.current
                // If this is a huge forward jump (more than 200 chars), it might be inaccurate
                // Only allow if it's clearly progressing forward and not a jump to wrong page
                if (positionDiff > 200) {
                  // Check if this is a legitimate large jump (e.g., chunk boundary)
                  // Allow if we're clearly progressing and haven't jumped backwards recently
                  if (lastHighlightedPosition !== null && clampedPosition < lastHighlightedPosition) {
                    // Position went backwards - reject
                    return
                  }
                  // For very large jumps, be more conservative - only update if it's clearly progressing
                  if (positionDiff > chunkTextLength * 0.3) {
                    // Suspiciously large jump - might be wrong, use last known good position
                    clampedPosition = lastValidHighlightPositionRef.current
                  }
                }
              }
              
              currentPlaybackPositionRef.current = clampedPosition
              lastBoundaryPositionRef.current = clampedPosition

              // Always update highlight - use position directly (same as blue highlight)
              // This ensures the highlight follows the audio precisely
              lastHighlightedPosition = clampedPosition
              // Use the position directly to find the element (same logic as blue highlight)
              highlightCurrentReading(clampedPosition)
            }
          }

          // Use timeupdate for frequent position updates (fires ~4 times per second)
          audio.addEventListener('timeupdate', updatePosition)

          if (chunkIndex === 0) {
            audio.addEventListener('play', () => {
              currentPlaybackPositionRef.current = startPosition
              playbackStartPositionRef.current = startPosition
              playbackStartTimeRef.current = Date.now()
              lastBoundaryPositionRef.current = startPosition
              previousBoundaryPositionRef.current = startPosition
              
              // Reset page tracking when starting new playback
              currentReadingPageRef.current = null
              // CRITICAL: Initialize lastValidHighlightPositionRef to startPosition to prevent initial jump
              // This ensures the first update doesn't jump ahead
              lastValidHighlightPositionRef.current = startPosition
              lastHighlightedCharIndexRef.current = null
              lastHighlightedElementRef.current = null
              
              // CRITICAL: Don't highlight immediately - wait for timeupdate to ensure audio is actually playing
              // This prevents highlighting from getting ahead when clicking to start
              // The timeupdate handler will highlight once audio.currentTime >= 0.3

              if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing'
                navigator.mediaSession.metadata = new MediaMetadata({
                  title: pdfFile ? pdfFile.name : 'SpeechCase',
                  artist: 'Text-to-Speech (Google)',
                  album: 'PDF Reader'
                })
              }
            })
          }

          return new Promise((resolve, reject) => {
            audio.addEventListener('ended', () => {
              console.log(`Chunk ${chunkIndex + 1} of ${allChunks.length} ended`)
              
              // Update chunk index
              currentChunkIndexRef.current = chunkIndex + 1
              
              // Play next chunk if available and not cancelled
              if (!isCancelledRef.current && chunkIndex + 1 < allChunks.length) {
                console.log(`Playing next chunk ${chunkIndex + 2} of ${allChunks.length}`)
                
                // Clear the audio ref temporarily to allow next chunk to set it
                // But keep a reference to check if we should continue
                const shouldContinue = audioRef.current === audio || !audioRef.current
                
                if (!shouldContinue) {
                  console.log('Audio was replaced by another playback, stopping chunk chain')
                  setIsPlaying(false)
                  isPlayingRef.current = false
                  setIsTTSLoading(false)
                  clearReadingHighlight()
                  if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'paused'
                  }
                  resolve()
                  return
                }
                
                // Clear audioRef to allow next chunk to set it
                audioRef.current = null
                
                // Check if next chunk is already preloaded
                if (chunkCache.has(chunkIndex + 1)) {
                  // Next chunk is ready - play immediately (no pause!)
                  console.log(`Next chunk is preloaded, playing immediately`)
                  playChunk(chunkIndex + 1)
                    .then(() => {
                      resolve()
                    })
                    .catch((err) => {
                      console.error('Error playing next chunk:', err)
                      setIsPlaying(false)
                      isPlayingRef.current = false
                      setIsTTSLoading(false)
                      setError('Error playing next audio chunk: ' + err.message)
                      clearReadingHighlight()
                      if ('mediaSession' in navigator) {
                        navigator.mediaSession.playbackState = 'paused'
                      }
                      resolve()
                    })
                } else {
                  // Next chunk not ready yet - wait for it (should be rare if preloading works)
                  console.log(`Next chunk not ready, waiting...`)
                  setIsTTSLoading(true)
                  preloadChunk(chunkIndex + 1)
                    .then(() => {
                      setIsTTSLoading(false)
                      if (!isCancelledRef.current && chunkCache.has(chunkIndex + 1)) {
                        playChunk(chunkIndex + 1)
                          .then(() => {
                            resolve()
                          })
                          .catch((err) => {
                            console.error('Error playing next chunk:', err)
                            setIsPlaying(false)
                            isPlayingRef.current = false
                            setIsTTSLoading(false)
                            setError('Error playing next audio chunk: ' + err.message)
                            clearReadingHighlight()
                            if ('mediaSession' in navigator) {
                              navigator.mediaSession.playbackState = 'paused'
                            }
                            resolve()
                          })
                      } else {
                        // Cancelled or chunk not available
                        setIsPlaying(false)
                        isPlayingRef.current = false
                        setIsTTSLoading(false)
                        clearReadingHighlight()
                        if ('mediaSession' in navigator) {
                          navigator.mediaSession.playbackState = 'paused'
                        }
                        resolve()
                      }
                    })
                    .catch((err) => {
                      setIsTTSLoading(false)
                      console.error('Error preloading next chunk:', err)
                      setIsPlaying(false)
                      isPlayingRef.current = false
                      setError('Error loading next audio chunk: ' + err.message)
                      clearReadingHighlight()
                      if ('mediaSession' in navigator) {
                        navigator.mediaSession.playbackState = 'paused'
                      }
                      resolve()
                    })
                }
              } else {
                // All chunks done or cancelled
                console.log('All chunks finished or cancelled. Total chunks:', allChunks.length, 'Current index:', chunkIndex)
                setIsPlaying(false)
                isPlayingRef.current = false
                setIsTTSLoading(false)
                currentPlaybackPositionRef.current = startPosition + text.length
                playbackStartTimeRef.current = null
                clearReadingHighlight()

                if ('mediaSession' in navigator) {
                  navigator.mediaSession.playbackState = 'paused'
                }

                audioRef.current = null
                resolve()
              }
            })

            audio.addEventListener('error', (event) => {
              console.error(`Audio playback error for chunk ${chunkIndex + 1}:`, event, audio.error)
              const errorMsg = audio.error ? `Code: ${audio.error.code}, Message: ${audio.error.message}` : 'Unknown error'
              
              if (!isCancelledRef.current) {
                // Try to continue with next chunk if available, unless it's a critical error
                const isCriticalError = audio.error && (audio.error.code === 4) // MEDIA_ELEMENT_ERROR: Format error
                
                if (!isCriticalError && chunkIndex + 1 < allChunks.length) {
                  console.log(`Non-critical error, attempting to continue with next chunk...`)
                  // Clear current audio ref
                  if (audioRef.current === audio) {
                    audioRef.current = null
                  }
                  // Try to play next chunk
                  currentChunkIndexRef.current = chunkIndex + 1
                  if (chunkCache.has(chunkIndex + 1)) {
                    playChunk(chunkIndex + 1)
                      .then(() => {
                        console.log('Successfully continued playback after error')
                        resolve()
                      })
                      .catch((err) => {
                        console.error('Failed to continue playback after error:', err)
                        setError('Error playing audio: ' + errorMsg + '. Could not continue playback.')
                        setIsPlaying(false)
                        isPlayingRef.current = false
                        setIsTTSLoading(false)
                        playbackStartTimeRef.current = null
                        clearReadingHighlight()
                        if ('mediaSession' in navigator) {
                          navigator.mediaSession.playbackState = 'paused'
                        }
                        resolve()
                      })
                  } else {
                    // Next chunk not ready, stop playback
                    setError('Error playing audio: ' + errorMsg)
                    setIsPlaying(false)
                    isPlayingRef.current = false
                    setIsTTSLoading(false)
                    playbackStartTimeRef.current = null
                    clearReadingHighlight()
                    if ('mediaSession' in navigator) {
                      navigator.mediaSession.playbackState = 'paused'
                    }
                    resolve()
                  }
                } else {
                  // Critical error or no more chunks - stop playback
                  setError('Error playing audio: ' + errorMsg)
                  setIsPlaying(false)
                  isPlayingRef.current = false
                  setIsTTSLoading(false)
                  playbackStartTimeRef.current = null
                  clearReadingHighlight()

                  if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'paused'
                  }
                  resolve()
                }
              } else {
                // Cancelled, just resolve
                resolve()
              }
              
              if (audioRef.current === audio) {
                audioRef.current = null
              }
            })

            // Start playing
            audio.play()
              .then(() => {
                console.log(`Started playing chunk ${chunkIndex + 1}`)
              })
              .catch(reject)
          })
        }

        // All chunks are already being preloaded in parallel
        // Start playing first chunk immediately (it's already loaded)
        await playChunk(0)
        return true
      }
    } catch (error) {
      console.error('Error playing Google TTS audio:', error)
      setError('Error with text-to-speech: ' + error.message)
      setIsPlaying(false)
      isPlayingRef.current = false
      setIsTTSLoading(false)
      return false
    }
  }

  const initializePages = async () => {
    if (!pdfDoc || totalPages === 0) return

    setRenderedPages([])
    setTextItems([])
    setPageData([])
    canvasRefs.current = {}
    textLayerRefs.current = {}
    highlightLayerRefs.current = {}
    selectionLayerRefs.current = {}

    try {
      // Build repetition map for smart header/footer detection
      const { textToPages, pageTextItems } = await buildRepetitionMap(pdfDoc, totalPages)
      
      const pages = []
      let pageCharOffset = 0

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum)
        const viewport = page.getViewport({ scale: pageScale })
        
        // Get original textContent first - we need ALL items including spaces
        const textContent = await page.getTextContent()
        
        // Get the page data from our repetition map (for filtering decisions)
        const pageData = pageTextItems.find(p => p.pageNum === pageNum)
        if (!pageData) continue
        
        // Build filtering decisions based on pageData items
        // Since text items may be split differently between the two getTextContent() calls,
        // we'll build a cumulative text string and match based on character positions
        // CRITICAL: Use the same viewport scale as buildRepetitionMap (1.0) for Y position calculations
        // to ensure consistent header/footer region detection
        const buildRepetitionViewport = page.getViewport({ scale: 1.0 })
        const headerThreshold = buildRepetitionViewport.height * 0.15
        const footerThreshold = buildRepetitionViewport.height * 0.80
        
        // Build a map of text segments to filtering decisions
        // Key: normalized text segment, Value: shouldKeep
        const textSegmentKeepMap = new Map()
        
        pageData.items.forEach(({ item, normalized, originalNormalized, yPos }) => {
          // yPos was calculated using scale 1.0 in buildRepetitionMap, so use the same thresholds
          const isInHeader = yPos <= headerThreshold
          const isInFooter = yPos >= footerThreshold
          const isInHeaderFooterRegion = isInHeader || isInFooter
          
          let shouldKeep = true
          
          if (isInHeaderFooterRegion) {
            const lookupKey = normalized.includes('|') ? normalized : normalizeText(item.str) + '|' + item.str.length
            const pagesWithThisText = textToPages.get(lookupKey)
            const repetitionCount = pagesWithThisText ? pagesWithThisText.size : 0
            
            let normalizedLength
            let normalizedTextOnly
            if (originalNormalized) {
              normalizedTextOnly = originalNormalized
              normalizedLength = originalNormalized.length
            } else if (normalized.includes('|')) {
              normalizedTextOnly = normalized.split('|')[0]
              normalizedLength = normalizedTextOnly.length
            } else {
              normalizedTextOnly = normalized
              normalizedLength = normalized.length
            }
            
            const isCommon = isCommonWord(normalizedTextOnly)
            
            // CRITICAL FIX: Be more conservative - don't filter words that are:
            // 1. 3+ characters (technical terms, proper nouns, etc.) - these are likely content
            // 2. Only filter very short words (1-2 chars) in header/footer regions (likely page numbers)
            // 3. For words 3+ chars, require much higher repetition threshold (4+ pages) to filter
            // This prevents filtering legitimate technical terms like "machine", "AI", etc.
            const isVeryShort = normalizedLength <= 2
            const isThreeOrMoreChars = normalizedLength >= 3
            
            // For words 3+ chars, require much higher repetition threshold (4+ pages) to filter
            // This prevents filtering legitimate technical terms that appear in multiple section headers
            // For very short words (1-2 chars), keep the original logic (likely page numbers)
            const repetitionThreshold = isThreeOrMoreChars ? 4 : 2
            
            const isLikelyHeaderFooter = (repetitionCount >= repetitionThreshold && !isCommon) || 
                                       (isVeryShort && isInHeaderFooterRegion && !isCommon)
            shouldKeep = !isLikelyHeaderFooter
          }
          
          // Store decision for this text segment (normalized for matching)
          const normalizedText = normalizeText(item.str.trim())
          if (normalizedText.length > 0) {
            // Use normalized text as key to handle whitespace differences
            textSegmentKeepMap.set(normalizedText, shouldKeep)
          }
        })
        
        // Filter textContent.items by checking if their normalized text matches any segment
        // Since items may be split differently, we need to handle partial matches
        // Strategy: If an item's text is a substring of a pageData segment, use that segment's decision
        const filteredItems = textContent.items.filter((item) => {
          // Always keep empty/whitespace items (they weren't in pageData but are needed for spacing)
          if (!item.str || item.str.trim().length === 0) {
            return true
          }
          
          const normalizedItemText = normalizeText(item.str.trim())
          
          // First, try exact match
          let shouldKeep = textSegmentKeepMap.get(normalizedItemText)
          
          if (shouldKeep !== undefined) {
            // Found exact match - use the filtering decision
            return shouldKeep
          }
          
          // No exact match - check if this item's text is a substring of any pageData segment
          // or if any pageData segment is a substring of this item's text
          // This handles cases where items are split differently
          // CRITICAL: Be conservative - only filter if we're very confident it's a header/footer
          // If an item doesn't match anything, keep it (safer to keep than to filter)
          let foundMatch = false
          let bestMatch = null
          let bestMatchRatio = 0
          for (const [segmentText, segmentKeep] of textSegmentKeepMap.entries()) {
            // Check if item text is contained in segment, or segment is contained in item text
            if (normalizedItemText.includes(segmentText) || segmentText.includes(normalizedItemText)) {
              // Calculate length similarity ratio to prefer better matches
              const lengthRatio = Math.min(normalizedItemText.length, segmentText.length) / Math.max(normalizedItemText.length, segmentText.length)
              // Only consider matches where lengths are similar (at least 50% overlap)
              // AND only filter out if the segment was marked to filter (shouldKeep === false)
              // If segment should be kept, we keep the item regardless of match quality
              if (lengthRatio >= 0.5 && lengthRatio > bestMatchRatio) {
                // Only use this match if it's a filter decision (shouldKeep === false)
                // If segment should be kept, we'll keep the item anyway, so don't override
                if (segmentKeep === false) {
                  bestMatch = segmentKeep
                  bestMatchRatio = lengthRatio
                  foundMatch = true
                } else if (!foundMatch) {
                  // If we haven't found a filter match yet, and this is a keep match,
                  // remember it but don't use it yet (we might find a better filter match)
                  bestMatch = segmentKeep
                  bestMatchRatio = lengthRatio
                }
              }
            }
          }
          
          // Only apply filter decision if we found a confident match to a filtered segment
          // Otherwise, keep the item (safer to keep than to filter)
          if (foundMatch && bestMatch === false) {
            return false
          }
          
          // No confident filter match found - keep the item to be safe
          return true
        })
        
        const filteredTextContent = {
          ...textContent,
          items: filteredItems
        }
        
        // Build pageText consistently: trim items to avoid double spaces, join with single space
        // This is used for extractedText (TTS purposes) - filtered
        const pageText = filteredItems.map(item => item.str.trim()).filter(str => str.length > 0).join(' ')

        pages.push({
          pageNum,
          viewport: {
            width: viewport.width,
            height: viewport.height
          },
          pageCharOffset,
          // CRITICAL: Store BOTH filtered and unfiltered textContent
          // - textContent (unfiltered): used for rendering text layer (all text visible for highlighting)
          // - filteredTextContent: used for building extractedText (TTS purposes, headers/footers filtered)
          textContent: textContent, // Unfiltered - for text layer rendering
          filteredTextContent: filteredTextContent // Filtered - for TTS/extractedText
        })

        // Calculate offset for next page: current page text + '\n\n' (except for last page)
        // Page 1 ends at position (pageText.length - 1)
        // '\n\n' is at positions pageText.length and (pageText.length + 1)
        // Page 2 starts at position (pageText.length + 2)
        if (pageNum < totalPages) {
          pageCharOffset += pageText.length + 2 // +2 for '\n\n' after this page
        } else {
          pageCharOffset += pageText.length // Last page has no trailing '\n\n'
        }
      }

      setPageData(pages)
      
      // Background: Re-process pages with enhanced filtering (non-blocking)
      // This enhances the page data without blocking initial rendering
      setTimeout(async () => {
        try {
          const enhancedPages = []
          let pageCharOffset = 0
          
          for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum)
            const viewport = page.getViewport({ scale: pageScale })
            const pageData = pageTextItems.find(p => p.pageNum === pageNum)
            if (!pageData) continue
            
            // Re-filter with repetition-based filtering
            const filteredItems = await filterHeadersAndFootersWithLLM(pageData, textToPages)
            
            const textContent = await page.getTextContent()
            const filteredTextContent = {
              ...textContent,
              items: filteredItems
            }
            
            // Build pageText consistently: trim items to avoid double spaces, join with single space
            // This is used for extractedText (TTS purposes) - filtered
            const pageText = filteredItems.map(item => item.str.trim()).filter(str => str.length > 0).join(' ')
            
            enhancedPages.push({
              pageNum,
              viewport: {
                width: viewport.width,
                height: viewport.height
              },
              pageCharOffset,
              // CRITICAL: Store BOTH filtered and unfiltered textContent
              // - textContent (unfiltered): used for rendering text layer (all text visible for highlighting)
              // - filteredTextContent: used for building extractedText (TTS purposes, headers/footers filtered)
              textContent: textContent, // Unfiltered - for text layer rendering
              filteredTextContent: filteredTextContent // Filtered - for TTS/extractedText
            })
            
            // Calculate offset for next page: current page text + '\n\n' (except for last page)
            // Page 1 ends at position (pageText.length - 1)
            // '\n\n' is at positions pageText.length and (pageText.length + 1)
            // Page 2 starts at position (pageText.length + 2)
            if (pageNum < totalPages) {
              pageCharOffset += pageText.length + 2 // +2 for '\n\n' after this page
            } else {
              pageCharOffset += pageText.length // Last page has no trailing '\n\n'
            }
          }
          
          // Update page data in background (won't interrupt if TTS is playing)
          setPageData(enhancedPages)
          console.log('Page data enhanced with LLM footer classification')
        } catch (error) {
          console.warn('Background page enhancement failed:', error)
          // Keep using initial pages - no interruption
        }
      }, 100) // Small delay to ensure initial render completes
    } catch (err) {
      console.error('Error initializing pages:', err)
      setError('Error loading PDF pages: ' + err.message)
    }
  }

  // Helper function to get canvas displayed dimensions consistently
  // Uses canvas.style.width/height (which matches internal dimensions) when available,
  // falls back to getBoundingClientRect() if style not set yet
  const getCanvasDisplayedDimensions = (canvas) => {
    if (!canvas) return { width: 0, height: 0 }
    
    // Get CSS dimensions (which should match internal dimensions since we set them explicitly)
    const canvasStyleWidth = canvas.style.width
    const canvasStyleHeight = canvas.style.height
    
    if (canvasStyleWidth && canvasStyleHeight) {
      // Parse CSS width/height (remove 'px' suffix)
      return {
        width: parseFloat(canvasStyleWidth),
        height: parseFloat(canvasStyleHeight)
      }
    } else {
      // Fallback to getBoundingClientRect if style not set yet
      const canvasRect = canvas.getBoundingClientRect()
      return {
        width: canvasRect.width,
        height: canvasRect.height
      }
    }
  }

  const renderPages = async () => {
    if (!pdfDoc || pageData.length === 0) return

    // Cancel ALL existing render tasks BEFORE waiting for promise
    // This prevents multiple renders from starting simultaneously
    for (const [pageNum, task] of activeRenderTasks.entries()) {
      try {
        task.cancel()
      } catch (e) {
        // Ignore cancellation errors
      }
    }
    activeRenderTasks.clear()

    // Serialize render operations: wait for any previous render to finish
    if (renderPagesPromise) {
      try {
        await renderPagesPromise
      } catch (e) {
        // Ignore errors from previous render; we'll try again
        console.error('Previous renderPages run failed, continuing with new render:', e)
      }
    }

    const run = async () => {
      // Small delay to ensure any previous cancellation completes
      await new Promise(resolve => setTimeout(resolve, 50))
      
      for (const pageInfo of pageData) {
        const { pageNum, viewport, pageCharOffset, textContent } = pageInfo
        const canvas = canvasRefs.current[pageNum]
        const textLayerDiv = textLayerRefs.current[pageNum]
        const highlightLayerDiv = highlightLayerRefs.current[pageNum]

        if (!canvas || !textLayerDiv) continue

        // Double-check: Cancel any existing render task for this page (defensive)
        const existingTask = activeRenderTasks.get(pageNum)
        if (existingTask) {
          try {
            existingTask.cancel()
          } catch (e) {
            // Ignore cancellation errors
          }
          activeRenderTasks.delete(pageNum)
        }

        // Render canvas
        const page = await pdfDoc.getPage(pageNum)
        const viewportObj = page.getViewport({ scale: pageScale })
        const context = canvas.getContext('2d')
        
        // Clear canvas before rendering to prevent artifacts
        context.clearRect(0, 0, canvas.width || viewportObj.width, canvas.height || viewportObj.height)
        
        // Set internal dimensions to match viewport (for crisp rendering at the desired scale)
        canvas.height = viewportObj.height
        canvas.width = viewportObj.width
        
        // Set CSS dimensions to match internal dimensions exactly to prevent blurry CSS scaling
        // The container will handle overflow with scrolling if the canvas is larger
        canvas.style.width = viewportObj.width + 'px'
        canvas.style.height = viewportObj.height + 'px'

        const renderTask = page.render({
          canvasContext: context,
          viewport: viewportObj
        })
        
        // Store the render task so we can cancel it if needed
        activeRenderTasks.set(pageNum, renderTask)
        
        try {
          await renderTask.promise
        } catch (renderError) {
          // Ignore cancellation errors - they're expected when cancelling
          if (!renderError.message?.includes('cancelled') && !renderError.message?.includes('Rendering cancelled')) {
            throw renderError
          }
        }
        
        // Remove from active tasks after completion
        activeRenderTasks.delete(pageNum)

        // Wait for canvas to be laid out
        await new Promise(resolve => requestAnimationFrame(resolve))

        // Set highlight layer dimensions to match canvas display size
        if (highlightLayerDiv) {
          const canvasDims = getCanvasDisplayedDimensions(canvas)
          highlightLayerDiv.style.width = canvasDims.width + 'px'
          highlightLayerDiv.style.height = canvasDims.height + 'px'
          
          const textLayerDiv = textLayerRefs.current[pageNum]
          const parentContainer = highlightLayerDiv.parentElement
        }
        
        // Set connection layer dimensions to match canvas display size
        const connectionLayerDiv = connectionLayerRefs.current[pageNum]
        if (connectionLayerDiv) {
          const canvasDims = getCanvasDisplayedDimensions(canvas)
          connectionLayerDiv.style.width = canvasDims.width + 'px'
          connectionLayerDiv.style.height = canvasDims.height + 'px'
        }
        
        // Set selection layer dimensions to match canvas display size
        const selectionLayerDiv = selectionLayerRefs.current[pageNum]
        if (selectionLayerDiv) {
          const canvasDims = getCanvasDisplayedDimensions(canvas)
          selectionLayerDiv.style.width = canvasDims.width + 'px'
          selectionLayerDiv.style.height = canvasDims.height + 'px'
        }

        // Render text layer (this will also set text layer dimensions)
        await renderTextLayerForPage(textContent, viewportObj, pageNum, textLayerDiv, pageCharOffset)

        setRenderedPages(prev => {
          if (!prev.includes(pageNum)) {
            return [...prev, pageNum]
          }
          return prev
        })
      }
    }

    renderPagesPromise = run()

    try {
      await renderPagesPromise
    } catch (err) {
      console.error('Error rendering pages:', err)
      setError('Error rendering PDF pages: ' + err.message)
    } finally {
      renderPagesPromise = null
    }
  }

  const renderThumbnails = async () => {
    if (!pdfDoc || totalPages === 0) return

    // Cancel ALL existing thumbnail render tasks BEFORE waiting for promise
    for (const [pageNum, task] of activeThumbnailTasks.entries()) {
      try {
        task.cancel()
      } catch (e) {
        // Ignore cancellation errors
      }
    }
    activeThumbnailTasks.clear()

    // Serialize thumbnail renders to avoid overlapping operations on the same canvas
    if (renderThumbnailsPromise) {
      try {
        await renderThumbnailsPromise
      } catch (e) {
        console.error('Previous renderThumbnails run failed, continuing with new render:', e)
      }
    }

    const run = async () => {
      // Small delay to ensure any previous cancellation completes
      await new Promise(resolve => setTimeout(resolve, 50))
      
      // Calculate thumbnail scale to show approximately 4-4.5 pages in the sidebar
      // Sidebar width is 180px, thumbnails will be CSS-scaled to fit this width
      // For a typical PDF page (612x792 points at 72 DPI):
      // - Aspect ratio: 612/792 ≈ 0.773 (width/height)
      // - If width is constrained to 180px, height = 180 / 0.773 ≈ 233px
      // - To show 4-4.5 pages: target height per thumbnail ≈ 150-170px (accounting for gaps)
      // - We'll render at a small scale and let CSS handle the final sizing
      const thumbnailScale = 0.2 // Scale for thumbnail rendering (will be CSS-scaled to fit)
      
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const thumbnailCanvas = thumbnailRefs.current[pageNum]
        if (!thumbnailCanvas) continue

        // Double-check: Cancel any existing render task for this thumbnail (defensive)
        const existingTask = activeThumbnailTasks.get(pageNum)
        if (existingTask) {
          try {
            existingTask.cancel()
            await new Promise(resolve => setTimeout(resolve, 10))
          } catch (e) {
            // Ignore cancellation errors
          }
          activeThumbnailTasks.delete(pageNum)
        }
        
        const page = await pdfDoc.getPage(pageNum)
        const viewport = page.getViewport({ scale: thumbnailScale })
        const context = thumbnailCanvas.getContext('2d')
        
        // Clear canvas before rendering
        context.clearRect(0, 0, thumbnailCanvas.width || viewport.width, thumbnailCanvas.height || viewport.height)
        
        // Set canvas dimensions
        thumbnailCanvas.width = viewport.width
        thumbnailCanvas.height = viewport.height
        
        // Render the page
        const renderTask = page.render({
          canvasContext: context,
          viewport: viewport
        })
        
        // Store the render task so we can cancel it if needed
        activeThumbnailTasks.set(pageNum, renderTask)
        
        try {
          await renderTask.promise
        } catch (renderError) {
          // Ignore cancellation errors - they're expected when cancelling
          if (!renderError.message?.includes('cancelled') && !renderError.message?.includes('Rendering cancelled')) {
            throw renderError
          }
        }
        
        // Remove from active tasks after completion
        activeThumbnailTasks.delete(pageNum)

        setRenderedThumbnails(prev => {
          if (!prev.includes(pageNum)) {
            return [...prev, pageNum]
          }
          return prev
        })
      }
    }

    renderThumbnailsPromise = run()

    try {
      await renderThumbnailsPromise
    } catch (err) {
      console.error('Error rendering thumbnails:', err)
    } finally {
      renderThumbnailsPromise = null
    }
  }

  const renderTextLayerForPage = async (textContent, viewport, pageNum, textLayerDiv, pageCharOffset) => {
    if (!extractedText || !textLayerDiv) return

    // Clear existing content
    textLayerDiv.innerHTML = ''

    // Get the canvas to calculate scaling ratio
    const canvas = canvasRefs.current[pageNum]
    if (!canvas) return

    // Wait for canvas to be laid out to get accurate dimensions
    await new Promise(resolve => requestAnimationFrame(resolve))

    // Get canvas dimensions - use helper function for consistency
    const canvasWidth = canvas.width
    const canvasHeight = canvas.height
    const canvasDims = getCanvasDisplayedDimensions(canvas)
    const displayedWidth = canvasDims.width
    const displayedHeight = canvasDims.height
    
    // Calculate scale factors (should be 1.0 when CSS size matches internal size)
    // This accounts for any CSS scaling that might occur
    const scaleX = displayedWidth / canvasWidth
    const scaleY = displayedHeight / canvasHeight

    // Set text layer dimensions to match canvas display size exactly
    textLayerDiv.style.width = displayedWidth + 'px'
    textLayerDiv.style.height = displayedHeight + 'px'

    // Build text position mapping
    // CRITICAL: extractedText is built from filteredItems in PDF.js extraction order,
    // but we render items in visual order (Y then X). We need to map each item to its
    // actual position in extractedText.
    
    // Get page info to find pageCharOffset
    const pageInfo = pageData.find(p => p.pageNum === pageNum)
    if (!pageInfo) return
    
    const pageStartCharIndex = pageInfo.pageCharOffset
    
    // CRITICAL: textContent is now UNFILTERED (all items for text layer rendering)
    // But extractedText is built from FILTERED items (for TTS)
    // We need to map unfiltered items to their positions in extractedText
    // Items that were filtered won't have a charIndex in extractedText
    
    // Get the filtered items to build the charIndex map
    const filteredItems = pageInfo.filteredTextContent ? pageInfo.filteredTextContent.items : []
    
    // Build a map: filtered item -> charIndex in extractedText
    // extractedText is built by: filteredItems.map(i => i.str.trim()).filter(s => s.length > 0).join(' ')
    const filteredItemToCharIndex = new Map()
    let currentPos = pageStartCharIndex
    
    // Iterate through filteredItems to build charIndex map
    filteredItems.forEach((item, itemIndex) => {
      if (!item.str || item.str.trim().length === 0) return
      const trimmedText = item.str.trim()
      const normalizedText = normalizeText(trimmedText)
      
      // Store charIndex by normalized text (for matching with unfiltered items)
      if (!filteredItemToCharIndex.has(normalizedText)) {
        filteredItemToCharIndex.set(normalizedText, currentPos)
      }
      
      // Advance position: item text + space (except for last non-empty item)
      currentPos += trimmedText.length
      // Add space between items (extractedText joins with ' ')
      // Check if there's a next non-empty item
      let hasNextNonEmpty = false
      for (let i = itemIndex + 1; i < filteredItems.length; i++) {
        if (filteredItems[i].str && filteredItems[i].str.trim().length > 0) {
          hasNextNonEmpty = true
          break
        }
      }
      if (hasNextNonEmpty) {
        currentPos += 1
      }
    })
    
    // Now build a map from unfiltered textContent.items indices to charIndex
    // by matching text content with filtered items
    const itemIndexToCharIndex = new Map()
    textContent.items.forEach((item, itemIndex) => {
      if (!item.str || item.str.trim().length === 0) return
      const normalizedText = normalizeText(item.str.trim())
      const charIndex = filteredItemToCharIndex.get(normalizedText)
      if (charIndex !== undefined) {
        itemIndexToCharIndex.set(itemIndex, charIndex)
        // Remove from map to handle duplicates (first match wins)
        filteredItemToCharIndex.delete(normalizedText)
      }
      // If not found, this item was filtered out - no charIndex assigned
    })
    
    // Ensure text layer has the correct class for PDF.js CSS
    textLayerDiv.className = 'textLayer'
    // Ensure PDF.js text layer receives correct scale factor for positioning
    if (viewport && viewport.scale) {
      textLayerDiv.style.setProperty('--scale-factor', viewport.scale)
    }
    
    // Use native PDF.js renderer to create text layer
    const textDivs = []
    try {
      const renderFn = typeof renderTextLayer === 'function' ? renderTextLayer : pdfjsLib.renderTextLayer
      if (!renderFn) {
        throw new Error('renderTextLayer is not available from pdfjs-dist')
      }
      renderFn({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: textDivs
      })
    } catch (error) {
      console.error('Error rendering text layer with native renderer:', error)
      throw error
    }
    
    // Helper function to calculate column index from X position
    // We'll detect column boundaries from the rendered spans
    const getColumnIndexFromX = (x, textLayerWidth) => {
      // Simple heuristic: divide text layer into columns based on width
      // For most documents, assume 1-2 columns
      // If X is in the left half, column 0; right half, column 1
      const midPoint = textLayerWidth / 2
      return x < midPoint ? 0 : 1
    }
    
    // After native render, map spans back to textContent.items to rebuild textItems
    // The native renderer creates one span per textContent item
    const renderedSpans = Array.from(textLayerDiv.querySelectorAll('span'))
    const pageTextItems = []
    
    // Create a map of item text to item index for matching
    const itemTextToIndex = new Map()
    textContent.items.forEach((item, itemIndex) => {
      if (!item.str || item.str.trim().length === 0) return
      const normalized = normalizeText(item.str.trim())
      // Use composite key: normalized text + original length to handle duplicates
      const key = `${normalized}|${item.str.length}`
      if (!itemTextToIndex.has(key)) {
        itemTextToIndex.set(key, [])
      }
      itemTextToIndex.get(key).push({ itemIndex, item })
    })
    
    // Match rendered spans to textContent.items
    renderedSpans.forEach((span, spanIndex) => {
      const spanText = span.textContent || ''
      const normalizedSpanText = normalizeText(spanText)
      
      // Try to find matching item
      let matchedItem = null
      let matchedItemIndex = -1
      
      // First, try exact match by normalized text
      const key = `${normalizedSpanText}|${spanText.length}`
      const candidates = itemTextToIndex.get(key)
      
      if (candidates && candidates.length > 0) {
        // Use the first unmatched candidate
        const candidate = candidates[0]
        matchedItem = candidate.item
        matchedItemIndex = candidate.itemIndex
        // Remove from candidates to handle duplicates
        candidates.shift()
      } else {
        // Fallback: try to match by position (spanIndex should roughly match itemIndex)
        // Only match non-empty items
        let itemIndex = spanIndex
        while (itemIndex < textContent.items.length) {
          const item = textContent.items[itemIndex]
          if (item && item.str && item.str.trim().length > 0) {
            const normalizedItemText = normalizeText(item.str.trim())
            if (normalizedItemText === normalizedSpanText || 
                normalizedItemText.includes(normalizedSpanText) ||
                normalizedSpanText.includes(normalizedItemText)) {
              matchedItem = item
              matchedItemIndex = itemIndex
              break
            }
          }
          itemIndex++
        }
      }
      
      if (matchedItem && matchedItemIndex >= 0) {
        // Get charIndex from map
        const charIndex = itemIndexToCharIndex.get(matchedItemIndex) ?? -1
        
        // Apply data attributes
        if (charIndex >= 0) {
          span.dataset.charIndex = charIndex
        }
        span.dataset.page = pageNum
        
        // Calculate column index from span position
        const spanRect = span.getBoundingClientRect()
        const textLayerRect = textLayerDiv.getBoundingClientRect()
        const spanX = spanRect.left - textLayerRect.left
        const columnIndex = getColumnIndexFromX(spanX, displayedWidth)
        span.dataset.columnIndex = columnIndex
        
        // Make text transparent (invisible but selectable)
        span.style.color = 'transparent'
        
        // Add text-space class for whitespace
        if (!/\S/.test(spanText)) {
          span.classList.add('text-space')
        }
        
        // Add to textItems if not filtered
        if (charIndex >= 0) {
          // Split span text into words for textItems (matching original behavior)
          const words = []
          let currentWord = ''
          for (let i = 0; i < spanText.length; i++) {
            const char = spanText[i]
            if (/\w/.test(char)) {
              currentWord += char
            } else {
              if (currentWord.length > 0) {
                words.push(currentWord)
                currentWord = ''
              }
              words.push(char)
            }
          }
          if (currentWord.length > 0) {
            words.push(currentWord)
          }
          
          // Create textItem for each word
          let wordOffset = 0
          words.forEach(word => {
            const wordCharIndex = charIndex + wordOffset
            const textItem = {
              str: word,
              page: pageNum,
              charIndex: wordCharIndex,
              element: span // Use the same span for all words in this item
            }
            pageTextItems.push(textItem)
            wordOffset += word.length
          })
        }
      }
    })
    
    // Re-apply exhibit highlighting
    const currentExhibits = exhibitsRef.current
    if (currentExhibits && currentExhibits.length > 0) {
      pageTextItems.forEach(textItem => {
        if (textItem.charIndex < 0) return
        
        for (const exhibit of currentExhibits) {
          const exhibitStart = exhibit.position
          const exhibitEnd = exhibit.position + exhibit.fullText.length
          const wordStart = textItem.charIndex
          const wordEnd = textItem.charIndex + textItem.str.length
          
          if (wordStart < exhibitEnd && wordEnd > exhibitStart) {
            const span = textItem.element
            span.classList.add('exhibit-highlight')
            span.dataset.exhibitType = exhibit.type
            span.dataset.exhibitNumber = exhibit.number
            span.style.cursor = 'pointer'
            
            // Add click handler for exhibit
            span.addEventListener('click', (e) => {
              if (interactionMode === 'read') {
                e.preventDefault()
                e.stopPropagation()
                setSidebarView('exhibits')
                window.dispatchEvent(new CustomEvent('selectExhibit', {
                  detail: { exhibit }
                }))
              }
            })
            
            break
          }
        }
      })
    }
    
    // Re-apply click handlers for TTS
    pageTextItems.forEach(textItem => {
      if (textItem.charIndex < 0) return
      
      const span = textItem.element
      const word = textItem.str
      
      // Only add click handler if not already an exhibit
      if (!span.classList.contains('exhibit-highlight')) {
        // Ensure pointer events are enabled for clicks
        span.style.pointerEvents = 'auto'
        span.style.cursor = interactionMode === 'read' ? 'pointer' : 'text'
        
        // Remove any existing click handler first to avoid duplicates
        if (span._ttsClickHandler) {
          span.removeEventListener('click', span._ttsClickHandler)
        }
        
        // Create new handler that checks current interactionMode from ref
        span._ttsClickHandler = (e) => {
          // Check current interactionMode from ref, not captured value
          if (interactionModeRef.current === 'read') {
            e.preventDefault()
            e.stopPropagation()
            if (/\S/.test(word)) {
              handleWordClick(textItem.charIndex, word, textItem.element)
            } else {
              const nextWordStart = findWordStart(extractedText, textItem.charIndex + word.length)
              handleWordClick(nextWordStart, word)
            }
          }
        }
        
        span.addEventListener('click', span._ttsClickHandler)
      }
    })
    
    // Update text items for this page
    setTextItems(prev => {
      const filtered = prev.filter(item => item.page !== pageNum)
      return [...filtered, ...pageTextItems]
    })
    
  }

  // Clear the current start position marker
  const clearStartMarker = () => {
    if (markedStartElementRef.current) {
      const element = markedStartElementRef.current
      // Check if element is still in DOM before trying to modify it
      if (element.isConnected) {
        element.style.removeProperty('background-color')
        element.style.removeProperty('border-bottom')
        element.style.removeProperty('border-bottom-color')
        element.classList.remove('start-position-marker')
      }
      markedStartElementRef.current = null
    }
  }

  // Mark an element as the start position
  const markStartPosition = (element) => {
    if (!element) return
    
    // Check if element is still in DOM
    if (!element.isConnected) {
      return
    }
    
    // Clear previous mark
    clearStartMarker()
    
    // Apply persistent marker styling using setProperty for better browser compatibility
    element.style.setProperty('background-color', 'rgba(66, 133, 244, 0.25)', 'important')
    element.style.setProperty('border-bottom', '2px solid #4285f4', 'important')
    element.style.setProperty('border-bottom-color', '#4285f4', 'important')
    element.classList.add('start-position-marker')
    markedStartElementRef.current = element
  }

  // Helper function to find all spans that belong to the current word
  const findWordSpans = (position, element = null) => {
    // CRITICAL: Always use position parameter to find word boundaries, not element.dataset.charIndex
    // The element might be a span containing multiple words, so we need the exact word position
    if (!extractedText || position < 0 || position >= extractedText.length) {
      // If element provided, return it as fallback
      if (element && element.isConnected) {
        return [element]
      }
      return []
    }
    
    // Find word boundaries using position (this is the reliable word position)
    let wordStart = position
    let wordEnd = position
    
    // Find start of word
    while (wordStart > 0 && /\S/.test(extractedText[wordStart - 1])) {
      wordStart--
    }
    
    // Find end of word
    while (wordEnd < extractedText.length && /\S/.test(extractedText[wordEnd])) {
      wordEnd++
    }
    
    // Get the word text from extractedText
    const wordText = extractedText.substring(wordStart, wordEnd).trim()
    if (!wordText) {
      // Fallback: if element provided, return it
      if (element && element.isConnected) {
        return [element]
      }
      return []
    }
    
    // Normalize word for matching (remove punctuation, lowercase)
    const normalizeWord = (str) => str.trim().toLowerCase().replace(/[^\w]/g, '')
    const wordTextNormalized = normalizeWord(wordText)
    
    // If element is provided, use its text layer as a starting point
    const textLayersToSearch = element && element.isConnected
      ? [element.closest('.textLayer')].filter(Boolean)
      : Object.values(textLayerRefs.current).filter(Boolean)
    
    // Also search document directly for all text layers if refs are incomplete
    if (textLayersToSearch.length === 0) {
      const allTextLayersInDoc = document.querySelectorAll('.textLayer, .text-layer')
      allTextLayersInDoc.forEach(layer => textLayersToSearch.push(layer))
    }
    
    const wordSpans = []
    
    // Search all relevant text layers for spans that contain this word
    // Strategy 1: Try to find spans with data-char-index that overlap with word position
    textLayersToSearch.forEach(textLayer => {
      if (!textLayer) return
      const spansWithCharIndex = textLayer.querySelectorAll('span[data-char-index]')
      spansWithCharIndex.forEach(span => {
        const spanCharIndex = parseInt(span.dataset.charIndex, 10)
        if (!isNaN(spanCharIndex)) {
          const spanText = span.textContent || ''
          const spanEnd = spanCharIndex + spanText.length
          
          // Check if this span overlaps with the word (span contains part of the word)
          if (spanCharIndex < wordEnd && spanEnd > wordStart) {
            wordSpans.push(span)
          }
        }
      })
    })
    
    // Strategy 2: If no spans found with data-char-index, search all spans by text content
    // CRITICAL: Only find spans that are near the expected position to avoid random matches
    if (wordSpans.length === 0) {
      // Calculate approximate position range - allow spans within 200 characters of the expected position
      // This prevents finding all occurrences of common words like "the" throughout the document
      const positionTolerance = 200
      const minPosition = Math.max(0, wordStart - positionTolerance)
      const maxPosition = wordEnd + positionTolerance
      
      // Track spans with their estimated positions for sorting
      const candidateSpans = []
      
      textLayersToSearch.forEach(textLayer => {
        if (!textLayer) return
        const allSpans = textLayer.querySelectorAll('span')
        allSpans.forEach(span => {
          const spanText = span.textContent || ''
          if (spanText.trim().length > 0) {
            // Check if span contains the word (normalized match)
            const spanTextNormalized = normalizeWord(spanText)
            // Check if the word appears in this span's text
            if (spanTextNormalized.includes(wordTextNormalized) || wordTextNormalized.includes(spanTextNormalized)) {
              // More precise: check if the exact word (with word boundaries) appears
              const wordRegex = new RegExp(`\\b${wordTextNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
              if (wordRegex.test(spanText)) {
                // Try to estimate this span's position in extractedText
                // Strategy: Find the span's text in extractedText near the expected position
                let estimatedPosition = null
                
                // Search for this span's text in extractedText within the tolerance range
                const searchStart = Math.max(0, minPosition - 100)
                const searchEnd = Math.min(extractedText.length, maxPosition + 100)
                const searchText = extractedText.substring(searchStart, searchEnd)
                const spanTextInExtracted = searchText.indexOf(spanText)
                
                if (spanTextInExtracted >= 0) {
                  estimatedPosition = searchStart + spanTextInExtracted
                  // Check if this estimated position is within tolerance
                  if (estimatedPosition >= minPosition && estimatedPosition <= maxPosition) {
                    candidateSpans.push({
                      span,
                      estimatedPosition,
                      distance: Math.abs(estimatedPosition - wordStart)
                    })
                  }
                } else {
                  // If we can't find the exact text, still add it but with lower priority
                  // Only if we have very few candidates
                  candidateSpans.push({
                    span,
                    estimatedPosition: wordStart, // Use expected position as fallback
                    distance: positionTolerance + 1 // Lower priority
                  })
                }
              }
            }
          }
        })
      })
      
      // Sort by distance from expected position and take the closest matches
      candidateSpans.sort((a, b) => a.distance - b.distance)
      
      // Only take spans that are reasonably close (within tolerance)
      // For very common words, limit to top 5 closest matches
      const maxMatches = wordTextNormalized.length <= 3 ? 3 : 5 // Shorter words are more common
      const closeMatches = candidateSpans
        .filter(c => c.distance <= positionTolerance)
        .slice(0, maxMatches)
      
      if (closeMatches.length > 0) {
        wordSpans.push(...closeMatches.map(c => c.span))
      }
    }
    
    // If we found spans, return them
    if (wordSpans.length > 0) {
      return wordSpans
    }
    
    // Fallback: if element provided, return it
    if (element && element.isConnected) {
      return [element]
    }
    
    return []
  }

  // Helper function to get bounding box of a specific word within a span using Range API
  const getWordBoundingBoxInSpan = (span, wordStart, wordEnd, extractedText) => {
    if (!span || !span.isConnected || !extractedText) return null
    
    const spanText = span.textContent || ''
    if (!spanText) return null
    
    // Get the word text from extractedText
    const wordText = extractedText.substring(wordStart, wordEnd).trim()
    if (!wordText) return null
    
    // Normalize for matching
    const normalizeWord = (str) => str.trim().toLowerCase().replace(/[^\w]/g, '')
    const wordTextNormalized = normalizeWord(wordText)
    
    // Strategy 1: If span has data-char-index, use it for precise calculation
    const spanCharIndex = parseInt(span.dataset.charIndex, 10)
    if (!isNaN(spanCharIndex)) {
      const spanEnd = spanCharIndex + spanText.length
      
      // Check if word is within this span
      if (wordStart < spanCharIndex || wordEnd > spanEnd) return null
      
      // Calculate the offset of the word within the span
      const wordStartInSpan = wordStart - spanCharIndex
      const wordEndInSpan = wordEnd - spanCharIndex
      
      // Get the text node within the span
      const textNode = Array.from(span.childNodes).find(node => node.nodeType === Node.TEXT_NODE)
      if (!textNode) return null
      
      // Create a range for just the word portion
      const range = document.createRange()
      try {
        range.setStart(textNode, Math.max(0, wordStartInSpan))
        range.setEnd(textNode, Math.min(textNode.textContent.length, wordEndInSpan))
        
        const rangeRect = range.getBoundingClientRect()
        if (rangeRect.width === 0 && rangeRect.height === 0) return null
        
        // Get container for relative positioning
        const container = span.closest('.textLayer') || span.closest('.text-layer') || span.closest('.pdf-canvas-wrapper') || span.closest('.pdf-page-wrapper')
        if (!container) return null
        
        const containerRect = container.getBoundingClientRect()
        
        return {
          x: rangeRect.left - containerRect.left,
          y: rangeRect.top - containerRect.top,
          width: rangeRect.width,
          height: rangeRect.height,
          container: container
        }
      } catch (e) {
        return null
      }
    }
    
    // Strategy 2: If span doesn't have data-char-index, find the word within the span's text using Range API
    // Find the position of the word in the span's text
    const wordRegex = new RegExp(`\\b${wordTextNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    const match = spanText.match(wordRegex)
    if (!match || match.index === undefined) return null
    
    // Get the text node within the span
    const textNode = Array.from(span.childNodes).find(node => node.nodeType === Node.TEXT_NODE)
    if (!textNode) return null
    
    // Create a range for just the word portion
    const range = document.createRange()
    try {
      const wordStartInSpan = match.index
      const wordEndInSpan = match.index + match[0].length
      
      range.setStart(textNode, Math.max(0, wordStartInSpan))
      range.setEnd(textNode, Math.min(textNode.textContent.length, wordEndInSpan))
      
      const rangeRect = range.getBoundingClientRect()
      if (rangeRect.width === 0 && rangeRect.height === 0) return null
      
      // Get container for relative positioning
      const container = span.closest('.textLayer') || span.closest('.text-layer') || span.closest('.pdf-canvas-wrapper') || span.closest('.pdf-page-wrapper')
      if (!container) return null
      
      const containerRect = container.getBoundingClientRect()
      
      return {
        x: rangeRect.left - containerRect.left,
        y: rangeRect.top - containerRect.top,
        width: rangeRect.width,
        height: rangeRect.height,
        container: container
      }
    } catch (e) {
      return null
    }
  }

  // Helper function to get bounding box for multiple elements relative to their container
  // If wordPosition is provided and we have a single span, try to get word-specific bounding box
  const getCombinedBoundingBox = (elements, wordPosition = null) => {
    if (elements.length === 0) return null

    // Find the common container (text layer or page wrapper)
    const firstElement = elements[0]
    if (!firstElement || !firstElement.isConnected) return null

    const container = firstElement.closest('.textLayer') || firstElement.closest('.text-layer') || firstElement.closest('.pdf-canvas-wrapper') || firstElement.closest('.pdf-page-wrapper')
    if (!container) return null

    // CRITICAL: If multiple spans are found, prefer the one closest to the expected position
    // This prevents huge bounding boxes when common words appear multiple times
    let elementsToUse = elements
    if (elements.length > 1 && wordPosition !== null && extractedText) {
      // Find word boundaries
      let wordStart = wordPosition
      let wordEnd = wordPosition
      while (wordStart > 0 && /\S/.test(extractedText[wordStart - 1])) wordStart--
      while (wordEnd < extractedText.length && /\S/.test(extractedText[wordEnd])) wordEnd++
      
      // Calculate distance from each span to the expected position
      const spansWithDistance = elements.map(span => {
        const spanText = span.textContent || ''
        const spanCharIndex = parseInt(span.dataset.charIndex, 10)
        
        let distance = Infinity
        if (!isNaN(spanCharIndex)) {
          // Use charIndex if available
          const spanCenter = spanCharIndex + spanText.length / 2
          distance = Math.abs(spanCenter - wordPosition)
        } else {
          // Estimate position by finding span text in extractedText near expected position
          const searchStart = Math.max(0, wordStart - 100)
          const searchEnd = Math.min(extractedText.length, wordEnd + 100)
          const searchText = extractedText.substring(searchStart, searchEnd)
          const spanTextInExtracted = searchText.indexOf(spanText)
          
          if (spanTextInExtracted >= 0) {
            const estimatedPosition = searchStart + spanTextInExtracted + spanText.length / 2
            distance = Math.abs(estimatedPosition - wordPosition)
          }
        }
        
        return { span, distance }
      })
      
      // Sort by distance and take the closest one
      spansWithDistance.sort((a, b) => a.distance - b.distance)
      elementsToUse = [spansWithDistance[0].span]
    }

    // If we have a single span and wordPosition, try to get word-specific bounding box
    // This works even if the span doesn't have data-char-index (getWordBoundingBoxInSpan handles both cases)
    if (elementsToUse.length === 1 && wordPosition !== null && extractedText) {
      const span = elementsToUse[0]
      
      // Find word boundaries
      let wordStart = wordPosition
      let wordEnd = wordPosition
      while (wordStart > 0 && /\S/.test(extractedText[wordStart - 1])) wordStart--
      while (wordEnd < extractedText.length && /\S/.test(extractedText[wordEnd])) wordEnd++
      
      const wordBoundingBox = getWordBoundingBoxInSpan(span, wordStart, wordEnd, extractedText)
      if (wordBoundingBox) {
        return wordBoundingBox
      }
    }

    const containerRect = container.getBoundingClientRect()
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    elementsToUse.forEach(element => {
      if (!element.isConnected) return
      const rect = element.getBoundingClientRect()
      
      // Calculate position relative to container
      const relativeX = rect.left - containerRect.left
      const relativeY = rect.top - containerRect.top

      minX = Math.min(minX, relativeX)
      minY = Math.min(minY, relativeY)
      maxX = Math.max(maxX, relativeX + rect.width)
      maxY = Math.max(maxY, relativeY + rect.height)
    })

    if (minX === Infinity) return null

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      container: container
    }
  }

  // Clear the current reading position highlight
  const clearReadingHighlight = () => {
    // Fade out the previous haze overlay
    if (currentHazeOverlayRef.current) {
      const overlay = currentHazeOverlayRef.current
      if (overlay.isConnected) {
        // Remove active class to stop the pulse animation
        overlay.classList.remove('active')
        // Add fade-out class to start the fade animation
        overlay.classList.add('fade-out')
        // Remove overlay after fade animation completes (increased by 40%, so 4984ms)
        setTimeout(() => {
          if (overlay.isConnected && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay)
          }
        }, 4984)
      }
      currentHazeOverlayRef.current = null
    }

    if (currentReadingElementRef.current) {
      const element = currentReadingElementRef.current
      // Check if element is still in DOM before trying to modify it
      if (element.isConnected) {
        // Only remove reading highlight, preserve start position marker if it's the same element
        if (element.classList.contains('start-position-marker')) {
          // If it's also the start marker, just remove reading-specific styles (green glow)
          // Keep the blue background and border
          element.classList.remove('current-reading-marker')
        } else {
          // If it's NOT the start marker, remove all reading highlight styles
          // This won't affect the blue start marker which is on a different element
          element.classList.remove('current-reading-marker')
        }
      }
      currentReadingElementRef.current = null
    }
    // Only clear the reading position state if playback is not active
    // This ensures the button stays visible when user scrolls away during playback
    if (!isPlayingRef.current) {
      setHasCurrentReadingPosition(false)
      // Reset page tracking when playback stops
      currentReadingPageRef.current = null
      lastValidHighlightPositionRef.current = null
      lastHighlightedCharIndexRef.current = null
      lastHighlightedElementRef.current = null
    }
    // Don't reset previousBoundaryPositionRef here - it's used for tracking
  }

  // Helper function to apply reading highlight
  const applyReadingHighlight = (element, isPageTransition = false, reliablePosition = null) => {
    
    // Clear previous reading highlight (but preserve blue start marker if it's on a different element)
    const previousElement = currentReadingElementRef.current
    const previousPage = previousElement ? getElementPageNumber(previousElement) : null
    
    // If isPageTransition is not provided, detect it from page change
    if (!isPageTransition && previousPage !== null) {
      const elementPage = getElementPageNumber(element)
      isPageTransition = elementPage !== null && elementPage !== previousPage
    }
    
    // CRITICAL: Use reliablePosition if provided (the exact word position), otherwise fall back to element.dataset.charIndex
    // reliablePosition is the precise character index of the word being spoken, which may be different from the span's start
    let charIndex = null
    if (reliablePosition !== null && reliablePosition >= 0) {
      charIndex = reliablePosition
    } else {
      // Fallback to element's charIndex if reliablePosition not provided
      charIndex = element.dataset.charIndex ? parseInt(element.dataset.charIndex, 10) : null
    }
    
    if (charIndex === null) {
      // Fallback to old behavior if no charIndex
      clearReadingHighlight()
      element.classList.add('current-reading-marker')
      currentReadingElementRef.current = element
      setHasCurrentReadingPosition(true)
      return
    }

    // Find all spans that belong to the current word
    // CRITICAL: Use charIndex (which is reliablePosition if provided), not element.dataset.charIndex
    // The element might be a span containing multiple words, so we need to use the exact word position
    // Pass the element directly so findWordSpans can use it even if textItemsRef is empty
    const wordSpans = findWordSpans(charIndex, element)
    
    // Clear previous highlight with fade transition
    clearReadingHighlight()
    
    // Add class to all word spans for tracking
    wordSpans.forEach(span => {
      span.classList.add('current-reading-marker')
    })
    currentReadingElementRef.current = element
    setHasCurrentReadingPosition(true)

    // Create organic haze overlay for the word
    if (wordSpans.length > 0) {
      // Pass charIndex (reliablePosition) to get word-specific bounding box when we have a single span
      const boundingBox = getCombinedBoundingBox(wordSpans, charIndex)
      if (boundingBox && boundingBox.container) {
        // Get the page number to find the correct highlight layer
        const elementPage = getElementPageNumber(element)
        if (elementPage !== null) {
          const highlightLayer = highlightLayerRefs.current[elementPage]
          if (highlightLayer) {
            // Create haze overlay element
            const overlay = document.createElement('div')
            overlay.className = 'reading-haze-overlay active'
            
            // Calculate padding to make the haze extend beyond the word (reduced by another 20% for smaller height)
            const padding = Math.max(boundingBox.height * 0.512, 7)
            const hazeWidth = boundingBox.width + padding * 2
            const hazeHeight = boundingBox.height + padding * 2
            
            // Position the overlay relative to highlight layer (same position as text layer)
            overlay.style.position = 'absolute'
            overlay.style.left = (boundingBox.x - padding) + 'px'
            overlay.style.top = (boundingBox.y - padding) + 'px'
            overlay.style.width = hazeWidth + 'px'
            overlay.style.height = hazeHeight + 'px'
            
            // Add some organic variation to the shape for more natural look
            const variation = Math.random() * 15 - 7.5 // -7.5 to 7.5
            overlay.style.borderRadius = `${50 + variation}% ${40 + variation}% ${60 - variation}% ${30 - variation}% / ${60 + variation}% ${30 - variation}% ${70 + variation}% ${40 - variation}%`
            
            // Append to highlight layer instead of text layer so it's always visible
            highlightLayer.appendChild(overlay)
            
            currentHazeOverlayRef.current = overlay
          } else {
            // Fallback to original container if highlight layer not available
            const overlay = document.createElement('div')
            overlay.className = 'reading-haze-overlay active'
            
            const padding = Math.max(boundingBox.height * 0.512, 7)
            const hazeWidth = boundingBox.width + padding * 2
            const hazeHeight = boundingBox.height + padding * 2
            
            overlay.style.position = 'absolute'
            overlay.style.left = (boundingBox.x - padding) + 'px'
            overlay.style.top = (boundingBox.y - padding) + 'px'
            overlay.style.width = hazeWidth + 'px'
            overlay.style.height = hazeHeight + 'px'
            
            const variation = Math.random() * 15 - 7.5
            overlay.style.borderRadius = `${50 + variation}% ${40 + variation}% ${60 - variation}% ${30 - variation}% / ${60 + variation}% ${30 - variation}% ${70 + variation}% ${40 - variation}%`
            
            boundingBox.container.appendChild(overlay)
            currentHazeOverlayRef.current = overlay
          }
        }
      }
    }
    
    // Scroll the element into view if auto-scroll is enabled
    // Use ref to check current state synchronously (not stale closure)
    if (autoScrollEnabledRef.current) {
      // Cancel any pending scroll timeout
      if (pendingScrollTimeoutRef.current) {
        clearTimeout(pendingScrollTimeoutRef.current)
        pendingScrollTimeoutRef.current = null
      }
      
      // Store reference to element to verify it's still the current one
      const elementToScroll = element
      const elementPage = getElementPageNumber(element)
      
      // Check if this is a page transition
      const isPageTransition = previousPage !== null && elementPage !== null && previousPage !== elementPage
      
      // For page transitions, scroll immediately without delay
      // For same-page scrolling, also use minimal delay (0ms) to ensure immediate response
      // when highlight goes out of view
      const scrollDelay = 0
      
      pendingScrollTimeoutRef.current = setTimeout(() => {
        pendingScrollTimeoutRef.current = null
        
        // Verify this is still the current reading element (might have changed)
        if (currentReadingElementRef.current !== elementToScroll) {
          return
        }
        
        // Verify element is still in DOM and valid
        if (!elementToScroll.isConnected) {
          return
        }
        
        // Verify page hasn't changed (prevent scrolling to wrong page)
        const currentElementPage = getElementPageNumber(elementToScroll)
        if (elementPage !== null && currentElementPage !== elementPage) {
          return
        }
        
        // Double-check the ref value (it might have changed during the timeout)
        if (!autoScrollEnabledRef.current) {
          return
        }
        
        const rect = elementToScroll.getBoundingClientRect()
        const viewportHeight = window.innerHeight
        const viewportWidth = window.innerWidth
        
        // For page transitions, always scroll immediately
        // For same-page scrolling, scroll if element is not fully visible (any part out of view)
        // This ensures immediate scrolling as soon as highlight goes out of sight
        // getBoundingClientRect() returns coordinates relative to viewport, so we check against window dimensions
        // Also trigger when element is within 50px of bottom/top edges to prevent cutoff
        const SCROLL_MARGIN = 50
        const isNotFullyVisible = rect.bottom < 0 || 
                                 rect.top > viewportHeight || 
                                 rect.right < 0 || 
                                 rect.left > viewportWidth ||
                                 rect.bottom > viewportHeight - SCROLL_MARGIN ||
                                 rect.top < SCROLL_MARGIN
        
        if (isPageTransition || isNotFullyVisible) {
          // Final check before scrolling
          if (!autoScrollEnabledRef.current || currentReadingElementRef.current !== elementToScroll) {
            return
          }
          
          // Verify element is still valid
          if (!elementToScroll.isConnected) {
            return
          }
          
          isProgrammaticScrollRef.current = true
          lastProgrammaticScrollTimeRef.current = Date.now()
          
          // Always use smooth scroll, but page transitions start immediately (0ms delay)
          elementToScroll.scrollIntoView({ behavior: 'smooth', block: 'center' })
          
          // Reset flag after scroll animation completes
          setTimeout(() => {
            isProgrammaticScrollRef.current = false
          }, 1100)
        }
      }, scrollDelay)
    }
  }

  // Helper function to check if an element is in the viewport
  const isElementInViewport = (element) => {
    if (!element || !element.isConnected) return false
    const rect = element.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    // Check if element is at least partially visible
    return rect.bottom > 0 && rect.top < viewportHeight && 
           rect.right > 0 && rect.left < viewportWidth
  }

  // Helper function to get the page number of an element
  const getElementPageNumber = (element) => {
    if (!element) return null
    // Try to get page from dataset
    if (element.dataset.page) {
      return parseInt(element.dataset.page)
    }
    // Try to find parent page wrapper
    let parent = element.parentElement
    while (parent) {
      if (parent.id && parent.id.startsWith('page-')) {
        const pageNum = parseInt(parent.id.replace('page-', ''))
        if (!isNaN(pageNum)) return pageNum
      }
      parent = parent.parentElement
    }
    return null
  }

  // Get the currently visible page and relative scroll position within it
  const getCurrentScrollPosition = () => {
    const pdfViewer = document.querySelector('.pdf-viewer-container')
    if (!pdfViewer) return null

    const scrollTop = pdfViewer.scrollTop
    const viewportHeight = pdfViewer.clientHeight
    const centerY = scrollTop + viewportHeight / 2

    // Find which page is at the center of the viewport
    let visiblePage = null
    let relativePosition = 0

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const pageElement = document.getElementById(`page-${pageNum}`)
      if (!pageElement) continue

      const pageRect = pageElement.getBoundingClientRect()
      const containerRect = pdfViewer.getBoundingClientRect()
      const pageTop = pageRect.top - containerRect.top + pdfViewer.scrollTop
      const pageBottom = pageTop + pageRect.height

      // Check if center of viewport is within this page
      if (centerY >= pageTop && centerY <= pageBottom) {
        visiblePage = pageNum
        // Calculate relative position (0 = top of page, 1 = bottom of page)
        relativePosition = (centerY - pageTop) / pageRect.height
        break
      }
    }

    // If no page found at center, find the first visible page
    if (!visiblePage) {
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const pageElement = document.getElementById(`page-${pageNum}`)
        if (!pageElement) continue

        const pageRect = pageElement.getBoundingClientRect()
        const containerRect = pdfViewer.getBoundingClientRect()
        const pageTop = pageRect.top - containerRect.top + pdfViewer.scrollTop
        const pageBottom = pageTop + pageRect.height

        // Check if any part of the page is visible
        if (scrollTop < pageBottom && scrollTop + viewportHeight > pageTop) {
          visiblePage = pageNum
          // Calculate relative position based on top of viewport
          relativePosition = Math.max(0, Math.min(1, (scrollTop - pageTop) / pageRect.height))
          break
        }
      }
    }

    return visiblePage ? { pageNum: visiblePage, relativePosition } : null
  }

  // Helper function to get text at a specific position range for validation
  const getTextAtPosition = (text, startPos, length = 50) => {
    if (!text || startPos < 0 || startPos >= text.length) return ''
    const endPos = Math.min(startPos + length, text.length)
    return text.substring(startPos, endPos).trim()
  }

  // Helper function to validate that an element's text matches expected text at position
  const validateElementText = (element, expectedPosition, extractedText) => {
    if (!element || !extractedText) return false
    
    // Get the element's text content
    const elementText = element.textContent || element.innerText || ''
    if (!elementText.trim()) return false
    
    // Get the expected text at this position (use a reasonable length for comparison)
    const expectedText = getTextAtPosition(extractedText, expectedPosition, elementText.length + 20)
    
    // Check if element text appears in the expected text
    // This handles cases where element might be a substring or word
    const normalizedElementText = elementText.trim().toLowerCase()
    const normalizedExpectedText = expectedText.toLowerCase()
    
    // Check if element text is found in expected text
    if (normalizedExpectedText.includes(normalizedElementText)) {
      return true
    }
    
    // Also check if element text starts with expected text (for partial matches)
    if (normalizedElementText.startsWith(normalizedExpectedText.substring(0, Math.min(10, normalizedExpectedText.length)))) {
      return true
    }
    
    return false
  }

  // Helper function to find the next element in sequence on a page
  const findNextElementOnPage = (currentElement, pageNum) => {
    if (!currentElement || !currentElement.isConnected) return null
    
    const textLayer = textLayerRefs.current[pageNum]
    if (!textLayer) return null
    
    // Get all elements on this page sorted by their position in DOM (reading order)
    const allElements = Array.from(textLayer.querySelectorAll('span[data-page="' + pageNum + '"]'))
      .filter(el => el.isConnected)
      .sort((a, b) => {
        // Sort by charIndex to maintain reading order
        const aIndex = parseInt(a.dataset.charIndex) || 0
        const bIndex = parseInt(b.dataset.charIndex) || 0
        return aIndex - bIndex
      })
    
    // Find current element's index
    const currentIndex = allElements.indexOf(currentElement)
    if (currentIndex === -1) return null
    
    // Return next element
    if (currentIndex < allElements.length - 1) {
      return allElements[currentIndex + 1]
    }
    
    return null // No next element on this page
  }

  // Highlight the element currently being read - ensure exact match with TTS position
  const highlightCurrentReading = (position) => {
    
    // Validate position is within bounds
    if (!extractedText || position < 0 || position > extractedText.length) {
      return
    }

    // Execute immediately - no delays
    const currentTextItems = textItemsRef.current
    if (!currentTextItems || currentTextItems.length === 0) {
      return
    }
    
    // Validate position against last known position to prevent large jumps
    if (lastValidHighlightPositionRef.current !== null) {
      const positionDiff = position - lastValidHighlightPositionRef.current
      // Reject significant backward jumps (more than 50 chars)
      if (positionDiff < -50) {
        return
      }
      // Reject very large forward jumps (more than 500 chars) unless it's a page transition
      // This prevents jumps to wrong pages
      if (positionDiff > 500 && currentReadingPageRef.current !== null) {
        // Only allow if we're explicitly transitioning pages
        const currentPage = currentReadingPageRef.current
        // Check if the new position is on a different page
        const potentialItems = currentTextItems.filter(item => {
          if (!item.element || !item.str || !item.element.isConnected) return false
          return item.charIndex <= position && item.charIndex + item.str.length >= position
        })
        const newPage = potentialItems.length > 0 ? getElementPageNumber(potentialItems[0].element) : null
        if (newPage !== null && newPage === currentPage) {
          // Still on same page but huge jump - reject
          return
        }
      }
    }
    
    // Sort all text items by charIndex to maintain reading order
    const sortedAllItems = [...currentTextItems].sort((a, b) => a.charIndex - b.charIndex)
    
    // CRITICAL: First, find the exact word at this position in extractedText
    // This ensures we match the correct instance, not just any instance that contains the position
    let targetWordStart = position
    let targetWordEnd = position
    
    // Find word boundaries in extractedText
    while (targetWordStart > 0 && /\S/.test(extractedText[targetWordStart - 1])) {
      targetWordStart--
    }
    while (targetWordEnd < extractedText.length && /\S/.test(extractedText[targetWordEnd])) {
      targetWordEnd++
    }
    
    const targetWord = extractedText.substring(targetWordStart, targetWordEnd)
    
    // Find ALL elements that contain this position (might be duplicates across pages)
    const matchingItems = sortedAllItems.filter(item => {
      if (!item.element || !item.str || !item.element.isConnected) return false
      // Position must be EXACTLY within this item's range (inclusive start, exclusive end for exact match)
      // But we use >= for end to include the last character
      return item.charIndex <= position && 
             item.charIndex + item.str.length > position
    })

    if (matchingItems.length === 0) {
      // No items found at this position - might be transitioning to next page
      // Check if we're at the last word on current page and position is on next page
      if (lastHighlightedElementRef.current !== null && lastHighlightedCharIndexRef.current !== null) {
        const lastElementPage = getElementPageNumber(lastHighlightedElementRef.current)
        if (lastElementPage !== null) {
          // Find all items on the last page
          const lastPageItems = sortedAllItems.filter(item => {
            const page = getElementPageNumber(item.element)
            return page === lastElementPage
          })
          
          // Check if we're at the last word on the page
          if (lastPageItems.length > 0) {
            const maxCharIndexOnLastPage = Math.max(...lastPageItems.map(i => i.charIndex + i.str.length))
            const isAtLastWord = lastHighlightedCharIndexRef.current >= maxCharIndexOnLastPage - 50
            
            // Check if position is on the next page (or close to it)
            const nextPageItems = sortedAllItems.filter(item => {
              const page = getElementPageNumber(item.element)
              return page === lastElementPage + 1
            })
            
            // If we're at the last word and position is past the last page (or very close), find closest item on next page
            if (isAtLastWord && nextPageItems.length > 0 && position >= maxCharIndexOnLastPage - 20) {
              // Find the closest item on next page to this position
              let nextPageItemAtPosition = nextPageItems.find(item => 
                item.charIndex <= position && item.charIndex + item.str.length > position
              )
              
              // If no exact match, find the closest item (within 200 chars)
              if (!nextPageItemAtPosition) {
                nextPageItemAtPosition = nextPageItems
                  .filter(item => Math.abs(item.charIndex - position) < 200)
                  .sort((a, b) => Math.abs(a.charIndex - position) - Math.abs(b.charIndex - position))[0]
              }
              
              if (nextPageItemAtPosition) {
                // Found item on next page - use it directly
                const elementPage = getElementPageNumber(nextPageItemAtPosition.element)
                const isPageTransition = currentReadingPageRef.current !== null && 
                                        elementPage !== null && 
                                        elementPage !== currentReadingPageRef.current
                currentReadingPageRef.current = elementPage || nextPageItemAtPosition.page
                lastValidHighlightPositionRef.current = position
                lastHighlightedCharIndexRef.current = nextPageItemAtPosition.charIndex
                lastHighlightedElementRef.current = nextPageItemAtPosition.element
                applyReadingHighlight(nextPageItemAtPosition.element, isPageTransition)
                return
              }
            }
          }
        }
      }
      return
    }

    // CRITICAL: If we have a last highlighted element AND the target word is the SAME as last highlighted word,
    // find the NEXT instance to prevent jumping to later instances of duplicate words
    if (lastHighlightedCharIndexRef.current !== null && targetWord.length > 0 && lastHighlightedElementRef.current !== null) {
      // Get the last highlighted word
      const lastElementText = lastHighlightedElementRef.current.textContent || ''
      const normalizeWord = (text) => text.trim().toLowerCase().replace(/[^\w]/g, '')
      const lastWord = normalizeWord(lastElementText)
      const targetWordNormalized = normalizeWord(targetWord)
      
      // Only apply strict filtering if we're matching the SAME word (duplicate word scenario)
      if (lastWord === targetWordNormalized && lastWord.length > 0) {
        // CRITICAL: First check if position is within the last highlighted word's range
        // If so, we're continuing to read the same word - use it, don't look for next instance
        const lastWordEnd = lastHighlightedCharIndexRef.current + (lastHighlightedElementRef.current.textContent || '').length
        if (position >= lastHighlightedCharIndexRef.current && position < lastWordEnd) {
          // Use the matching items that are at the same position
          const samePositionMatches = matchingItems.filter(item => 
            item.charIndex === lastHighlightedCharIndexRef.current
          )
          if (samePositionMatches.length > 0) {
            matchingItems.length = 0
            matchingItems.push(...samePositionMatches)
            // Skip the rest of duplicate word filtering - we're continuing the same word
          }
          // If no same position matches, fall through to duplicate logic below
        }
        
        // Only apply duplicate filtering if position is NOT within the last word's range
        // This means we've moved past the last word and might be matching a later instance
        const lastWordEndCheck = lastHighlightedCharIndexRef.current + (lastHighlightedElementRef.current.textContent || '').length
        if (position < lastHighlightedCharIndexRef.current || position >= lastWordEndCheck) {
          // CRITICAL: For duplicate words, IGNORE the position entirely and just select the IMMEDIATE next word
          // The TTS position calculation is unreliable for duplicate words and might point to later instances
          const lastElementPage = getElementPageNumber(lastHighlightedElementRef.current)
          
          // Find ALL items that match the target word and are forward from last highlighted (ignore position)
          const allForwardWordMatches = sortedAllItems.filter(item => {
          if (!item.element || !item.element.isConnected) return false
          const itemWord = normalizeWord(item.str)
          if (itemWord !== targetWordNormalized) return false
          if (item.charIndex <= lastHighlightedCharIndexRef.current) return false
          
          // Only consider items on the same page (prevent cross-page jumps)
          if (lastElementPage !== null) {
            const itemPage = getElementPageNumber(item.element)
            if (itemPage !== lastElementPage) return false
          }
          
          return true
        })
        if (allForwardWordMatches.length > 0) {
          // Find the IMMEDIATE next word (no items between)
          const immediateNextMatches = allForwardWordMatches.filter(item => {
            const itemsBetween = sortedAllItems.filter(i => {
              if (!i.element || !i.element.isConnected) return false
              const iPage = getElementPageNumber(i.element)
              if (lastElementPage !== null && iPage !== lastElementPage) return false
              return i.charIndex > lastHighlightedCharIndexRef.current && 
                     i.charIndex < item.charIndex
            })
            return itemsBetween.length === 0
          })
          
          if (immediateNextMatches.length > 0) {
            // Select the immediate next instance (smallest charIndex) - IGNORE position
            const nextInstance = immediateNextMatches.sort((a, b) => a.charIndex - b.charIndex)[0]
            matchingItems.length = 0
            matchingItems.push(nextInstance)
          } else {
            // CRITICAL: For duplicate words, if there's no immediate next, we MUST reject
            // Using "closest forward" would jump to a later instance, which is wrong
            return
          }
        } else {
          // No forward matches for duplicate word - check if same position (continuing same word)
          const samePositionMatches = matchingItems.filter(item => 
            item.charIndex === lastHighlightedCharIndexRef.current
          )
          if (samePositionMatches.length > 0) {
            matchingItems.length = 0
            matchingItems.push(...samePositionMatches)
          } else {
            // No valid forward match for duplicate word - reject to prevent jumping
            return
          }
        }
        } // End of duplicate word filtering (only if position outside last word range)
      }
      // If target word is different from last word, allow normal progression (no filtering needed)
    }
    
    // CRITICAL: If we have a last highlighted element, filter matches to its page FIRST
    // This prevents matching duplicate words on other pages even if position calculation is slightly off
    let filteredMatchingItems = matchingItems
    if (lastHighlightedElementRef.current !== null) {
      const lastElementPage = getElementPageNumber(lastHighlightedElementRef.current)
      if (lastElementPage !== null) {
        // Find items on the last page
        const lastPageMatchingItems = matchingItems.filter(item => {
          const elementPage = getElementPageNumber(item.element)
          return elementPage === lastElementPage
        })
        
        // Find maximum charIndex on last page
        const lastPageItems = sortedAllItems.filter(item => {
          const elementPage = getElementPageNumber(item.element)
          return elementPage === lastElementPage
        })
        
        let maxCharIndexOnLastPage = null
        if (lastPageItems.length > 0) {
          maxCharIndexOnLastPage = Math.max(...lastPageItems.map(item => item.charIndex + item.str.length))
        }
        
        // If position is within last page OR close to it (within 100 chars), prioritize last page items
        // But if we're at the boundary (within 20 chars of the end), also allow next page items
        if (maxCharIndexOnLastPage !== null && position <= maxCharIndexOnLastPage + 100) {
          const isAtBoundary = position >= maxCharIndexOnLastPage - 20
          
          if (lastPageMatchingItems.length > 0) {
            if (isAtBoundary) {
              // At boundary - allow both last page and next page items
              // This handles the case where we're at the last word and TTS moves to next page
              const nextPageMatchingItems = matchingItems.filter(item => {
                const elementPage = getElementPageNumber(item.element)
                return elementPage === lastElementPage + 1
              })
              if (nextPageMatchingItems.length > 0) {
                // Prefer next page items when at boundary (we're transitioning)
                filteredMatchingItems = nextPageMatchingItems
              } else {
                // No next page items, use last page items
                filteredMatchingItems = lastPageMatchingItems
              }
            } else {
              // Not at boundary - use only items on last page
              filteredMatchingItems = lastPageMatchingItems
            }
          } else {
            // No matches on last page
            if (isAtBoundary) {
              // At boundary - allow next page items
              const nextPageMatchingItems = matchingItems.filter(item => {
                const elementPage = getElementPageNumber(item.element)
                return elementPage === lastElementPage + 1
              })
              if (nextPageMatchingItems.length > 0) {
                filteredMatchingItems = nextPageMatchingItems
              } else {
                // No matches on last page or next page - reject to prevent jumping to duplicates
                return
              }
            } else {
              // No matches on last page but position is close - reject to prevent jumping to duplicates
              return
            }
          }
        }
        // If position is significantly past last page (>100 chars), allow next page items
      }
    }
    
    // Use filtered matches for all subsequent logic
    const finalMatchingItems = filteredMatchingItems

    // Validate that the element's text matches what's in extractedText at that position
    // CRITICAL: Be more lenient - if items don't match exactly, still allow them if they're close
    // This handles cases where PDF text extraction produces malformed items
    const validateElementText = (item) => {
      const relativePos = position - item.charIndex
      if (relativePos < 0 || relativePos >= item.str.length) {
        return false
      }
      
      // CRITICAL: Validate that the element's charIndex actually corresponds to the correct position in extractedText
      // Check if the text at item.charIndex in extractedText matches item.str
      // Be more lenient - allow partial matches to handle malformed PDF text extraction
      if (item.charIndex >= 0 && item.charIndex + item.str.length <= extractedText.length) {
        const extractedTextAtItem = extractedText.substring(item.charIndex, item.charIndex + item.str.length)
        // Normalize for comparison (handle whitespace differences)
        const normalize = (str) => str.replace(/\s+/g, ' ').trim()
        const normalizedExtracted = normalize(extractedTextAtItem)
        const normalizedItem = normalize(item.str)
        
        // Allow exact match
        if (normalizedExtracted === normalizedItem) {
          // Exact match - validate character
          const elementChar = item.str[relativePos]
          const extractedChar = extractedText[position]
          if (elementChar === extractedChar) {
            return true
          }
          // Also allow if both are whitespace (different types)
          if (/\s/.test(elementChar) && /\s/.test(extractedChar)) {
            return true
          }
        }
        
        // Allow partial match - if item text is a substring of extracted text or vice versa
        // This handles cases where PDF text extraction splits items differently
        if (normalizedExtracted.includes(normalizedItem) || normalizedItem.includes(normalizedExtracted)) {
          // Partial match found - check if character at position matches
          const elementChar = item.str[relativePos]
          const extractedChar = extractedText[position]
          if (elementChar === extractedChar) {
            return true
          }
          // Also allow if both are whitespace (different types)
          if (/\s/.test(elementChar) && /\s/.test(extractedChar)) {
            return true
          }
        }
        
        // No match found - reject this item
        return false
      }
      
      // Fallback: check if the character at this position in the element matches extractedText
      const elementChar = item.str[relativePos]
      const extractedChar = extractedText[position]
      // Allow for whitespace differences (element might have normalized spaces)
      if (elementChar === extractedChar) {
        return true
      }
      // Also allow if both are whitespace (different types)
      if (/\s/.test(elementChar) && /\s/.test(extractedChar)) {
        return true
      }
      return false
    }

    // Filter to only items where text matches (using filtered matches)
    const validatedItems = finalMatchingItems.filter(validateElementText)
    
    // Context-based matching: when we have multiple matches (duplicate words), use surrounding context
    const validateContext = (item) => {
      // If we have a last known position and element, use it to validate context
      if (lastValidHighlightPositionRef.current !== null && lastHighlightedElementRef.current !== null) {
        const lastElement = lastHighlightedElementRef.current
        const lastElementPage = getElementPageNumber(lastElement)
        const currentElementPage = getElementPageNumber(item.element)
        
        // If we're on the same page, prefer items that are forward in reading order
        if (lastElementPage === currentElementPage && lastElementPage !== null) {
          // Check if this item is forward from the last highlighted element
          const lastCharIndex = lastHighlightedCharIndexRef.current
          if (lastCharIndex !== null && item.charIndex < lastCharIndex) {
            // This item is before the last highlighted - reject unless we're going backwards (which we shouldn't)
            return false
          }
        }
        
        // If we're on a different page, ensure we've actually progressed past the current page
        if (lastElementPage !== null && currentElementPage !== null && lastElementPage !== currentElementPage) {
          // Only allow transition to next page (currentPage + 1)
          if (currentElementPage !== lastElementPage + 1) {
            // Jumping to a page that's not the immediate next page - likely a duplicate word
            return false
          }
          
          // Also check that the position is actually after the last page's content
          // Find the maximum charIndex on the last page
          const lastPageItems = sortedAllItems.filter(i => {
            const page = getElementPageNumber(i.element)
            return page === lastElementPage
          })
          if (lastPageItems.length > 0) {
            const maxCharIndexOnLastPage = Math.max(...lastPageItems.map(i => i.charIndex + i.str.length))
            // Allow transition if we're at or very close to the boundary (within 50 chars)
            // This handles the case where we're transitioning from the last word on a page
            const margin = 50
            if (position < maxCharIndexOnLastPage - margin) {
              // Position is still well within last page's range - reject duplicate on next page
              return false
            }
          }
        }
      }
      
      // Additional context validation: check surrounding text matches
      // Get a window of text around the position (20 chars before and after)
      const contextWindow = 20
      const contextStart = Math.max(0, position - contextWindow)
      const contextEnd = Math.min(extractedText.length, position + contextWindow)
      const extractedContext = extractedText.substring(contextStart, contextEnd)
      
      // Get the context around this item's position
      const itemContextStart = Math.max(0, item.charIndex - contextWindow)
      const itemContextEnd = Math.min(extractedText.length, item.charIndex + item.str.length + contextWindow)
      const itemContext = extractedText.substring(itemContextStart, itemContextEnd)
      
      // Find where the position is in both contexts
      const positionInExtractedContext = position - contextStart
      const positionInItemContext = position - itemContextStart
      
      // Check if the surrounding text matches (at least 10 chars before and after should match)
      const checkLength = Math.min(10, Math.min(positionInExtractedContext, positionInItemContext))
      if (checkLength > 0) {
        const beforeExtracted = extractedContext.substring(Math.max(0, positionInExtractedContext - checkLength), positionInExtractedContext)
        const beforeItem = itemContext.substring(Math.max(0, positionInItemContext - checkLength), positionInItemContext)
        
        // Normalize whitespace for comparison
        const normalize = (str) => str.replace(/\s+/g, ' ').trim()
        if (normalize(beforeExtracted) !== normalize(beforeItem)) {
          // Context doesn't match - likely a duplicate word
          return false
        }
      }
      
      return true
    }
    
    // Apply context validation to validated items
    const contextValidatedItems = validatedItems.length > 0 
      ? validatedItems.filter(validateContext)
      : finalMatchingItems.filter(validateContext)
    
    // If context validation filtered out all items, fall back to validated items
    // But only if we're on the current page (to prevent jumping to duplicates)
    const itemsToUse = contextValidatedItems.length > 0 
      ? contextValidatedItems
      : (currentReadingPageRef.current !== null 
          ? validatedItems.filter(item => {
              const elementPage = getElementPageNumber(item.element)
              return elementPage === currentReadingPageRef.current
            })
          : validatedItems.length > 0 ? validatedItems : finalMatchingItems)
    
    // CRITICAL: Use the last highlighted element's page as the primary constraint
    // This is more reliable than currentReadingPageRef which might not be set correctly
    let itemAtPosition = null
    let targetPage = currentReadingPageRef.current
    
    // If we have a last highlighted element, use its page as the target
    if (lastHighlightedElementRef.current !== null) {
      const lastElementPage = getElementPageNumber(lastHighlightedElementRef.current)
      if (lastElementPage !== null) {
        targetPage = lastElementPage
      }
    }
    
    if (targetPage !== null) {
      // Find all items on the target page
      const targetPageItems = sortedAllItems.filter(item => {
        const elementPage = getElementPageNumber(item.element)
        return elementPage === targetPage
      })
      
      // Find maximum charIndex on target page
      let maxCharIndexOnTargetPage = null
      if (targetPageItems.length > 0) {
        maxCharIndexOnTargetPage = Math.max(...targetPageItems.map(item => item.charIndex + item.str.length))
      }
      
      // STRICT RULE: If position is within target page's range, ONLY match items on target page
      // This prevents matching duplicate words on other pages
      const isWithinTargetPage = maxCharIndexOnTargetPage !== null && position <= maxCharIndexOnTargetPage
      
        if (isWithinTargetPage) {
        // Position is within target page - ONLY match items on target page
        const targetPageMatchingItems = finalMatchingItems.filter(item => {
          const elementPage = getElementPageNumber(item.element)
          return elementPage === targetPage
        })
        
        if (targetPageMatchingItems.length > 0) {
          // CRITICAL: When we have a last highlighted element, ALWAYS select the NEXT word forward
          // AND within a reasonable distance to prevent matching later instances
          if (lastHighlightedCharIndexRef.current !== null) {
            // Calculate maximum forward distance based on position change
            // Use a reasonable limit that allows normal progression but prevents large jumps
            const positionDiff = lastValidHighlightPositionRef.current !== null 
              ? position - lastValidHighlightPositionRef.current 
              : 50
            // Allow reasonable forward progression: at least 50 chars, up to 200 chars
            // This allows normal word-by-word progression while preventing large jumps
            const maxForwardDistance = Math.min(200, Math.max(50, positionDiff * 2 + 30))
            
            // Filter to only items that are forward and within reasonable distance
            const forwardItems = targetPageMatchingItems.filter(item => {
              const distanceFromLast = item.charIndex - lastHighlightedCharIndexRef.current
              return distanceFromLast > 0 && distanceFromLast <= maxForwardDistance
            })
            
            if (forwardItems.length > 0) {
              // CRITICAL: Select the item with the SMALLEST charIndex that's still forward
              // This ensures we always pick the NEXT instance, not a later one
              itemAtPosition = forwardItems.sort((a, b) => {
                // Sort by charIndex ascending - this gives us the NEXT word forward
                return a.charIndex - b.charIndex
              })[0]
            } else {
              // No forward items within reasonable distance - might be a duplicate word too far ahead
              // Check if any item is at the exact same position (might be continuing same word)
              const exactMatches = targetPageMatchingItems.filter(item => 
                item.charIndex === lastHighlightedCharIndexRef.current
              )
              
              if (exactMatches.length > 0) {
                // Same position - use it (might be continuing the same word)
                itemAtPosition = exactMatches[0]
              } else {
                // No valid forward match - reject to prevent jumping to later instances
                // This is safer than selecting a far-away duplicate
                return
              }
            }
          } else {
            // No last highlighted position - use closest to current position
            itemAtPosition = targetPageMatchingItems.sort((a, b) => {
              const aDistance = Math.abs(position - a.charIndex)
              const bDistance = Math.abs(position - b.charIndex)
              return aDistance - bDistance
            })[0]
          }
          
          // If still no match, try validated items
    if (!itemAtPosition) {
            itemAtPosition = itemsToUse.find(item => {
              const elementPage = getElementPageNumber(item.element)
              return elementPage === targetPage
            })
          }
        }
        
        // If we couldn't find a match on target page, reject entirely (don't jump to other pages)
        if (!itemAtPosition) {
          return
        }
      } else {
        // Position is past target page - check if we should allow transition to next page
        // First, check if there are any items on target page that are close to this position
        // This helps catch cases where position calculation is slightly off
        const positionTolerance = 50 // Allow 50 chars tolerance
        const nearbyTargetPageItems = targetPageItems.filter(item => {
          const itemEnd = item.charIndex + item.str.length
          // Check if position is within tolerance of any item on target page
          return Math.abs(position - item.charIndex) <= positionTolerance || 
                 Math.abs(position - itemEnd) <= positionTolerance ||
                 (position >= item.charIndex && position <= itemEnd)
        })
        
        // If there are nearby items on target page, prefer those (position might be slightly off)
        if (nearbyTargetPageItems.length > 0) {
          // Find matching items among nearby items
          const nearbyMatchingItems = nearbyTargetPageItems.filter(item => {
            return item.charIndex <= position && item.charIndex + item.str.length > position
          })
          
          if (nearbyMatchingItems.length > 0) {
            // CRITICAL: Always select the NEXT word forward within reasonable distance
            if (lastHighlightedCharIndexRef.current !== null) {
              const positionDiff = lastValidHighlightPositionRef.current !== null 
                ? position - lastValidHighlightPositionRef.current 
                : 50
              // Allow reasonable forward progression: at least 50 chars, up to 200 chars
              const maxForwardDistance = Math.min(200, Math.max(50, positionDiff * 2 + 30))
              
              const forwardItems = nearbyMatchingItems.filter(item => {
                const distanceFromLast = item.charIndex - lastHighlightedCharIndexRef.current
                return distanceFromLast > 0 && distanceFromLast <= maxForwardDistance
              })
              
              if (forwardItems.length > 0) {
                // Select the NEXT word (smallest charIndex that's forward)
                itemAtPosition = forwardItems.sort((a, b) => a.charIndex - b.charIndex)[0]
              } else {
                // No forward items within distance - check if same position
                const exactMatches = nearbyMatchingItems.filter(item => 
                  item.charIndex === lastHighlightedCharIndexRef.current
                )
                if (exactMatches.length > 0) {
                  itemAtPosition = exactMatches[0]
                } else {
                  // No valid forward match - reject
                  return
                }
              }
            } else {
              itemAtPosition = nearbyMatchingItems.sort((a, b) => {
                const aDistance = Math.abs(position - a.charIndex)
                const bDistance = Math.abs(position - b.charIndex)
                return aDistance - bDistance
              })[0]
            }
          } else {
            // No exact match, but there are nearby items - select NEXT forward within distance
            if (lastHighlightedCharIndexRef.current !== null) {
              const positionDiff = lastValidHighlightPositionRef.current !== null 
                ? position - lastValidHighlightPositionRef.current 
                : 50
              // Allow reasonable forward progression: at least 50 chars, up to 200 chars
              const maxForwardDistance = Math.min(200, Math.max(50, positionDiff * 2 + 30))
              
              const forwardItems = nearbyTargetPageItems.filter(item => {
                const distanceFromLast = item.charIndex - lastHighlightedCharIndexRef.current
                return distanceFromLast > 0 && distanceFromLast <= maxForwardDistance
              })
              
              if (forwardItems.length > 0) {
                // Select NEXT word forward
                itemAtPosition = forwardItems.sort((a, b) => a.charIndex - b.charIndex)[0]
              } else {
                // No valid forward match - reject
                return
              }
            } else {
              itemAtPosition = nearbyTargetPageItems.sort((a, b) => {
                const aDistance = Math.abs(position - a.charIndex)
                const bDistance = Math.abs(position - b.charIndex)
                return aDistance - bDistance
              })[0]
            }
          }
        } else {
          // No nearby items on target page - check if we should allow transition to next page
          // Only allow if position is significantly past (with large margin to prevent false matches)
          const margin = 100 // Require 100 chars past page boundary for duplicate word prevention
          const isSignificantlyPastTargetPage = maxCharIndexOnTargetPage !== null && position > maxCharIndexOnTargetPage + margin
          
          if (isSignificantlyPastTargetPage) {
            // We ARE significantly past the target page - allow transition to next page only
            const nextPage = targetPage + 1
            const nextPageItems = itemsToUse.filter(item => {
              const elementPage = getElementPageNumber(item.element)
              return elementPage === nextPage
            })
            
            if (nextPageItems.length > 0) {
              // Use the item closest to position on next page
              itemAtPosition = nextPageItems.sort((a, b) => {
        const aDistance = position - a.charIndex
        const bDistance = position - b.charIndex
        return aDistance - bDistance
      })[0]
            }
          } else {
            // Position is close to page boundary but not significantly past - reject to prevent duplicate matches
            return
          }
        }
      }
      
      // Final validation: ensure item is on target page or immediate next page
      if (itemAtPosition) {
        const elementPage = getElementPageNumber(itemAtPosition.element)
        if (elementPage !== null && elementPage !== targetPage && elementPage !== targetPage + 1) {
          // Item is on wrong page - reject to prevent duplicate word jumps
          itemAtPosition = null
          return
        }
      }
    }
    
    // If no item on current page, or no current page, find the best match
    // BUT: if we have a last highlighted element, still enforce its page constraint
    if (!itemAtPosition) {
      // If we have a last highlighted element, we MUST stay on its page or the immediate next page
      if (lastHighlightedElementRef.current !== null) {
        const lastElementPage = getElementPageNumber(lastHighlightedElementRef.current)
        if (lastElementPage !== null) {
          // Only consider items on the last page or immediate next page
          const constrainedItems = itemsToUse.filter(item => {
            const elementPage = getElementPageNumber(item.element)
            return elementPage === lastElementPage || elementPage === lastElementPage + 1
          })
          
          if (constrainedItems.length > 0) {
            // Find the maximum charIndex on the last page
            const lastPageItems = sortedAllItems.filter(i => {
              const page = getElementPageNumber(i.element)
              return page === lastElementPage
            })
            
            let maxCharIndexOnLastPage = null
            if (lastPageItems.length > 0) {
              maxCharIndexOnLastPage = Math.max(...lastPageItems.map(i => i.charIndex + i.str.length))
            }
            
            // If position is within last page, ONLY use items on last page
            if (maxCharIndexOnLastPage !== null && position <= maxCharIndexOnLastPage) {
              const lastPageOnlyItems = constrainedItems.filter(item => {
                const elementPage = getElementPageNumber(item.element)
                return elementPage === lastElementPage
              })
              if (lastPageOnlyItems.length > 0) {
                itemAtPosition = lastPageOnlyItems.sort((a, b) => {
                  const aDistance = Math.abs(position - a.charIndex)
                  const bDistance = Math.abs(position - b.charIndex)
                  return aDistance - bDistance
                })[0]
              }
            } else if (maxCharIndexOnLastPage !== null && position > maxCharIndexOnLastPage + 100) {
              // Position is significantly past last page - allow next page items
              itemAtPosition = constrainedItems.sort((a, b) => {
                const aDistance = Math.abs(position - a.charIndex)
                const bDistance = Math.abs(position - b.charIndex)
                return aDistance - bDistance
              })[0]
            } else {
              // Position is close to boundary - reject to prevent duplicate matches
              return
            }
          } else {
            // No items on last page or next page - reject to prevent jumping to wrong pages
            return
          }
        }
      }
      
        // If we still don't have an item, use the fallback logic
      if (!itemAtPosition) {
        // CRITICAL: Always select the NEXT word forward within reasonable distance
        // This ensures sequential progression regardless of position calculation accuracy
        if (lastHighlightedCharIndexRef.current !== null) {
          const positionDiff = lastValidHighlightPositionRef.current !== null 
            ? position - lastValidHighlightPositionRef.current 
            : 50
          // Allow reasonable forward progression: at least 50 chars, up to 200 chars
          const maxForwardDistance = Math.min(200, Math.max(50, positionDiff * 2 + 30))
          
          // Filter to only items forward and within reasonable distance
          const forwardItems = itemsToUse.filter(item => {
            const distanceFromLast = item.charIndex - lastHighlightedCharIndexRef.current
            return distanceFromLast > 0 && distanceFromLast <= maxForwardDistance
          })
          
          if (forwardItems.length > 0) {
            // Select the NEXT word (smallest charIndex that's forward)
            itemAtPosition = forwardItems.sort((a, b) => a.charIndex - b.charIndex)[0]
          } else {
            // No forward items within distance - check if same position
            const exactMatches = itemsToUse.filter(item => 
              item.charIndex === lastHighlightedCharIndexRef.current
            )
            if (exactMatches.length > 0) {
              itemAtPosition = exactMatches[0]
            } else {
              // No valid forward match - reject to prevent jumping to later instances
              return
            }
          }
        } else {
          // No last highlighted position - use closest to current position
          itemAtPosition = itemsToUse.sort((a, b) => {
            // First, prefer items that are forward from last known position
            if (lastValidHighlightPositionRef.current !== null) {
              const aIsForward = a.charIndex >= lastValidHighlightPositionRef.current
              const bIsForward = b.charIndex >= lastValidHighlightPositionRef.current
              if (aIsForward !== bIsForward) {
                return aIsForward ? -1 : 1
              }
            }
            // Then sort by distance to position
            const aDistance = Math.abs(position - a.charIndex)
            const bDistance = Math.abs(position - b.charIndex)
            return aDistance - bDistance
          })[0]
        }
      }
    }
    
    if (!itemAtPosition || !itemAtPosition.element) {
      return
    }

    const element = itemAtPosition.element
    const selectedPage = getElementPageNumber(element)
    
    // CRITICAL: Before final validation, check if there are any items between last and current
    // This ensures we're selecting the NEXT word, not skipping ahead to a later instance
    if (lastHighlightedCharIndexRef.current !== null && lastHighlightedElementRef.current !== null) {
      const lastCharIndex = lastHighlightedCharIndexRef.current
      const currentCharIndex = itemAtPosition.charIndex
      const lastElementPage = getElementPageNumber(lastHighlightedElementRef.current)
      const currentElementPage = getElementPageNumber(element)
      
      // Get the current and last words for duplicate detection
      const currentElementText = element.textContent || ''
      const lastElementText = lastHighlightedElementRef.current.textContent || ''
      const normalizeWord = (text) => text.trim().toLowerCase().replace(/[^\w]/g, '')
      const currentWord = normalizeWord(currentElementText)
      const lastWord = normalizeWord(lastElementText)
      const isDuplicateWord = currentWord === lastWord && currentWord.length > 0
      
      // Check if there are any items between last highlighted and current selection
      const itemsBetween = sortedAllItems.filter(item => {
        if (!item.element || !item.element.isConnected) return false
        const itemPage = getElementPageNumber(item.element)
        // Only count items on the same page (or if we're transitioning, count items on last page)
        if (lastElementPage === currentElementPage) {
          return itemPage === lastElementPage && 
                 item.charIndex > lastCharIndex && 
                 item.charIndex < currentCharIndex
        } else {
          // Page transition - check items on last page after lastCharIndex
          return itemPage === lastElementPage && item.charIndex > lastCharIndex
        }
      })
      
      // CRITICAL: For duplicate words, we MUST use the immediate next word (no items between)
      // IGNORE position entirely for duplicate words - just use sequential progression
      if (isDuplicateWord && itemsBetween.length > 0) {
        // For duplicate words, we completely ignore position and just use the immediate next word
        // Find the immediate next word after last highlighted
        const immediateNextItem = itemsBetween.sort((a, b) => a.charIndex - b.charIndex)[0]
        
        // For duplicate words, ALWAYS use immediate next, regardless of position
        itemAtPosition = immediateNextItem
        // Update element reference
        const elementPage = getElementPageNumber(immediateNextItem.element)
        const isPageTransition = currentReadingPageRef.current !== null && 
                                elementPage !== null && 
                                elementPage !== currentReadingPageRef.current
        currentReadingPageRef.current = elementPage || immediateNextItem.page
        lastValidHighlightPositionRef.current = position
        lastHighlightedCharIndexRef.current = immediateNextItem.charIndex
        lastHighlightedElementRef.current = immediateNextItem.element
        applyReadingHighlight(immediateNextItem.element, isPageTransition)
        return
      }
      
      // For duplicate words, if we're NOT skipping items, verify we're using the immediate next word
      if (isDuplicateWord && itemsBetween.length === 0) {
        // No items between - check if current selection is actually the immediate next
        // Find what should be the immediate next word
        const shouldBeNext = sortedAllItems
          .filter(i => {
            if (!i.element || !i.element.isConnected) return false
            const iPage = getElementPageNumber(i.element)
            if (lastElementPage !== null && iPage !== lastElementPage) return false
            return i.charIndex > lastCharIndex
          })
          .sort((a, b) => a.charIndex - b.charIndex)[0]
        
        if (shouldBeNext && shouldBeNext.charIndex < currentCharIndex) {
          // We're not using the immediate next - use it instead
          itemAtPosition = shouldBeNext
          const elementPage = getElementPageNumber(shouldBeNext.element)
          const isPageTransition = currentReadingPageRef.current !== null && 
                                  elementPage !== null && 
                                  elementPage !== currentReadingPageRef.current
          currentReadingPageRef.current = elementPage || shouldBeNext.page
          lastValidHighlightPositionRef.current = position
          lastHighlightedCharIndexRef.current = shouldBeNext.charIndex
          lastHighlightedElementRef.current = shouldBeNext.element
          applyReadingHighlight(shouldBeNext.element, isPageTransition)
          return
        }
      }
      
      // If we're on the same page and skipping items (but not duplicate word), check if we should use immediate next
      if (lastElementPage === currentElementPage && lastElementPage !== null && itemsBetween.length > 0 && !isDuplicateWord) {
        // For different words, check if immediate next also matches position
        const immediateNextItem = itemsBetween.sort((a, b) => a.charIndex - b.charIndex)[0]
        const immediateNextMatches = immediateNextItem.charIndex <= position && 
                                    immediateNextItem.charIndex + immediateNextItem.str.length > position
        
        if (immediateNextMatches) {
          // Use immediate next if it matches
          itemAtPosition = immediateNextItem
          const elementPage = getElementPageNumber(immediateNextItem.element)
          const isPageTransition = currentReadingPageRef.current !== null && 
                                  elementPage !== null && 
                                  elementPage !== currentReadingPageRef.current
          currentReadingPageRef.current = elementPage || immediateNextItem.page
          lastValidHighlightPositionRef.current = position
          lastHighlightedCharIndexRef.current = immediateNextItem.charIndex
          lastHighlightedElementRef.current = immediateNextItem.element
          applyReadingHighlight(immediateNextItem.element, isPageTransition)
          return
        }
        // If immediate next doesn't match, allow normal progression (position might have advanced)
      }
      
      // If we're transitioning pages, ensure we've actually read past the last page
      if (lastElementPage !== null && currentElementPage !== null && lastElementPage !== currentElementPage) {
        // Check if there are items on the last page after lastCharIndex
        if (itemsBetween.length > 0) {
          // There are still items on the last page we haven't read - reject page transition
          return
        }
      }
    }
    
    // Final validation: ensure we're progressing forward in reading order
    // This prevents jumping to duplicate words that appear earlier
    if (lastHighlightedElementRef.current !== null && lastHighlightedCharIndexRef.current !== null) {
      const lastCharIndex = lastHighlightedCharIndexRef.current
      const currentCharIndex = itemAtPosition.charIndex
      const lastElementPage = getElementPageNumber(lastHighlightedElementRef.current)
      const currentElementPage = getElementPageNumber(element)
      
      // CRITICAL: If we're on a different page, ensure we've actually read past the last page
      if (lastElementPage !== null && currentElementPage !== null && lastElementPage !== currentElementPage) {
        // We're transitioning pages - validate this is legitimate
        if (currentElementPage !== lastElementPage + 1) {
          // Jumping to a page that's not the immediate next page - reject (likely duplicate word)
          return
        }
        
        // Find the maximum charIndex on the last page
        const lastPageItems = sortedAllItems.filter(i => {
          const page = getElementPageNumber(i.element)
          return page === lastElementPage
        })
        
        if (lastPageItems.length > 0) {
          const maxCharIndexOnLastPage = Math.max(...lastPageItems.map(i => i.charIndex + i.str.length))
          // Allow transition if we're at or very close to the last page boundary (within 20 chars)
          // This handles the case where we're at the last word on a page
          const margin = 20
          const isAtPageBoundary = position >= maxCharIndexOnLastPage - margin
          
          if (!isAtPageBoundary && position <= maxCharIndexOnLastPage) {
            // Position is still well within last page's range - reject duplicate on next page
            return
          }
          
          // Additional check: ensure currentCharIndex is also at or past the last page boundary
          const isCurrentAtBoundary = currentCharIndex >= maxCharIndexOnLastPage - margin
          if (!isCurrentAtBoundary && currentCharIndex <= maxCharIndexOnLastPage) {
            // Element is still well within last page - reject
            return
          }
        }
      }
      
      // If the new element is significantly before the last one (more than 10 chars), reject it
      // This prevents jumping to duplicate words on earlier pages
      if (currentCharIndex < lastCharIndex - 10) {
        // This is a backward jump to a duplicate word - reject
        return
      }
      
      // If we're on the same page, ensure we're moving forward
      if (lastElementPage === currentElementPage && lastElementPage !== null) {
        // On same page - must be forward
        if (currentCharIndex < lastCharIndex) {
          // Going backwards on same page - reject
          return
        }
      }
      
      // CRITICAL: Additional validation - check if we're jumping to a duplicate word
      // Get the word being read from the last element
      const lastElementText = lastHighlightedElementRef.current.textContent || ''
      const currentElementText = element.textContent || ''
      
      // Normalize text for comparison (remove punctuation, lowercase)
      const normalizeWord = (text) => text.trim().toLowerCase().replace(/[^\w]/g, '')
      const lastWord = normalizeWord(lastElementText)
      const currentWord = normalizeWord(currentElementText)
      
      // If both are the same word and we're on different pages, this is VERY suspicious
      if (lastWord.length > 0 && 
          lastWord === currentWord &&
          lastElementPage !== null && 
          currentElementPage !== null && 
          lastElementPage !== currentElementPage) {
        // Same word on different page - this is almost certainly a duplicate
        // Find the maximum charIndex on the last page
        const lastPageItems = sortedAllItems.filter(i => {
          const page = getElementPageNumber(i.element)
          return page === lastElementPage
        })
        
        if (lastPageItems.length > 0) {
          const maxCharIndexOnLastPage = Math.max(...lastPageItems.map(i => i.charIndex + i.str.length))
          // Require a VERY large margin (100 chars) to prevent false matches for duplicate words
          // This ensures we've actually read well past the page before matching the same word
          if (position < maxCharIndexOnLastPage + 100) {
            // Too close to last page - this is definitely a duplicate word, reject
            return
          }
          
          // Also check that currentCharIndex is well past the last page
          if (currentCharIndex < maxCharIndexOnLastPage + 100) {
            // Element position is too close - reject duplicate
            return
          }
        }
      }
      
      // Additional check: if we're on the same page but the word is the same and position jumped significantly
      // This might indicate we matched the wrong instance
      if (lastElementPage === currentElementPage && 
          lastElementPage !== null &&
          lastWord.length > 0 && 
          lastWord === currentWord) {
        const positionDiff = position - lastValidHighlightPositionRef.current
        // If position jumped more than 200 chars forward but we're still on same page with same word
        // This is suspicious - might be matching a duplicate later on the same page
        // But this is less critical since we're on the same page, so allow it
      }
    }
    
    // Verify element is still in DOM
    if (!element.isConnected) {
      // Try to find it again
      const pageNum = itemAtPosition.page
      const textLayer = textLayerRefs.current[pageNum]
      if (textLayer) {
        const newElement = textLayer.querySelector(`[data-char-index="${itemAtPosition.charIndex}"][data-page="${pageNum}"]`)
        if (newElement && newElement.isConnected) {
          // Validate the new element's text matches
          const relativePos = position - itemAtPosition.charIndex
          if (relativePos >= 0 && relativePos < itemAtPosition.str.length) {
            const elementChar = newElement.textContent[relativePos]
            const extractedChar = extractedText[position]
            if (elementChar === extractedChar || (/\s/.test(elementChar) && /\s/.test(extractedChar))) {
          // Update tracking
          const elementPage = getElementPageNumber(newElement)
          currentReadingPageRef.current = elementPage || pageNum
          lastValidHighlightPositionRef.current = position
          lastHighlightedCharIndexRef.current = itemAtPosition.charIndex
          lastHighlightedElementRef.current = newElement
          applyReadingHighlight(newElement)
            }
          }
        }
      }
      return
    }
    
    // Final validation: ensure the element's text at this position matches extractedText
    const relativePos = position - itemAtPosition.charIndex
    if (relativePos >= 0 && relativePos < itemAtPosition.str.length) {
      const elementChar = itemAtPosition.str[relativePos]
      const extractedChar = extractedText[position]
      // If characters don't match (and aren't both whitespace), reject
      if (elementChar !== extractedChar && !(/\s/.test(elementChar) && /\s/.test(extractedChar))) {
        // Text mismatch - try to find a better match
        // BUT: enforce page constraints if we have a last highlighted element
        let searchItems = sortedAllItems
        
        // If we have a last highlighted element, only search on its page or next page
        if (lastHighlightedElementRef.current !== null) {
          const lastElementPage = getElementPageNumber(lastHighlightedElementRef.current)
          if (lastElementPage !== null) {
            searchItems = sortedAllItems.filter(item => {
              const elementPage = getElementPageNumber(item.element)
              return elementPage === lastElementPage || elementPage === lastElementPage + 1
            })
          }
        }
        
        // CRITICAL: When searching for better match, ensure it's forward from last highlighted
        // and within a reasonable distance to prevent matching later instances
        const betterMatch = searchItems.find(item => {
          if (!item.element || !item.str || !item.element.isConnected) return false
          
          // If we have a last highlighted element, ensure this is forward and within reasonable distance
          if (lastHighlightedCharIndexRef.current !== null) {
            const distanceFromLast = item.charIndex - lastHighlightedCharIndexRef.current
            const positionDiff = lastValidHighlightPositionRef.current !== null
              ? position - lastValidHighlightPositionRef.current
              : 50
            // Allow reasonable forward progression: at least 50 chars, up to 200 chars
            const maxDistance = Math.min(200, Math.max(50, positionDiff * 2 + 30))
            
            // Must be forward, but also allow if position is within item's range (handles slight position errors)
            const positionInItem = position - item.charIndex
            const isPositionInRange = positionInItem >= 0 && positionInItem < item.str.length
            
            if (distanceFromLast <= 0 && !isPositionInRange) {
              // Not forward and position not in range - reject
              return false
            }
            if (distanceFromLast > 0 && distanceFromLast > maxDistance && !isPositionInRange) {
              // Too far forward and position not in range - reject
              return false
            }
          }
          
          if (item.charIndex <= position && item.charIndex + item.str.length > position) {
            const relPos = position - item.charIndex
            if (relPos >= 0 && relPos < item.str.length) {
              const elemChar = item.str[relPos]
              const extrChar = extractedText[position]
              return elemChar === extrChar || (/\s/.test(elemChar) && /\s/.test(extrChar))
            }
          }
          return false
        })
        
        if (betterMatch && betterMatch.element && betterMatch.element.isConnected) {
          // Additional validation: if we have a last highlighted element, ensure better match is on correct page
          if (lastHighlightedElementRef.current !== null) {
            const lastElementPage = getElementPageNumber(lastHighlightedElementRef.current)
            const betterMatchPage = getElementPageNumber(betterMatch.element)
            
            if (lastElementPage !== null && betterMatchPage !== null) {
              // If better match is on a different page, validate it's legitimate
              if (betterMatchPage !== lastElementPage) {
                // Must be immediate next page
                if (betterMatchPage !== lastElementPage + 1) {
                  // Wrong page - reject
                  return
                }
                
                // Check that position is past the last page
                const lastPageItems = sortedAllItems.filter(i => {
                  const page = getElementPageNumber(i.element)
                  return page === lastElementPage
                })
                if (lastPageItems.length > 0) {
                  const maxCharIndexOnLastPage = Math.max(...lastPageItems.map(i => i.charIndex + i.str.length))
                  if (position <= maxCharIndexOnLastPage + 100) {
                    // Too close to last page - reject duplicate
                    return
                  }
                }
              }
            }
          }
          
          itemAtPosition = betterMatch
          // Update element reference
          const elementPage = getElementPageNumber(betterMatch.element)
    const isPageTransition = currentReadingPageRef.current !== null && 
                            elementPage !== null && 
                            elementPage !== currentReadingPageRef.current
          currentReadingPageRef.current = elementPage || betterMatch.page
          lastValidHighlightPositionRef.current = position
          lastHighlightedCharIndexRef.current = betterMatch.charIndex
          lastHighlightedElementRef.current = betterMatch.element
          applyReadingHighlight(betterMatch.element, isPageTransition)
          return
        } else {
          // No better match found - reject this update
        return
        }
      }
    }
    
    // Update tracking and highlight - always update to follow position
    const elementPage = getElementPageNumber(element)
    const isPageTransition = currentReadingPageRef.current !== null && 
                            elementPage !== null && 
                            elementPage !== currentReadingPageRef.current
    
    // Update tracking
    currentReadingPageRef.current = elementPage || itemAtPosition.page
    lastValidHighlightPositionRef.current = position
    lastHighlightedCharIndexRef.current = itemAtPosition.charIndex
    lastHighlightedElementRef.current = element
    
    // Always highlight the element at the current position
    applyReadingHighlight(element, isPageTransition)
  }

  const handleWordClick = (charIndex, word, clickedElement = null) => {
    // CRITICAL: Only handle clicks in 'read' mode (Set Start mode)
    // In 'highlight' mode, clicks should only create highlights, not start TTS
    // Check ref first (most up-to-date), then state as fallback
    if (interactionModeRef.current !== 'read') {
      return
    }
    
    // Since we now have word-level spans, charIndex should already be at the word start
    // Only call findWordStart if we clicked on whitespace/punctuation
    let wordStart = charIndex
    
    // If we clicked on whitespace/punctuation, find the next word
    // Otherwise, charIndex is already at the word start, so use it directly
    if (extractedText && charIndex < extractedText.length && /\s/.test(extractedText[charIndex])) {
      // Clicked on whitespace - find the next word
      wordStart = findWordStart(extractedText, charIndex)
    } else if (extractedText && charIndex < extractedText.length && /\S/.test(extractedText[charIndex])) {
      // Clicked on a word - ensure we're at the start (charIndex should already be correct)
      // Only go backwards if we're not already at a word boundary
      if (charIndex > 0 && /\S/.test(extractedText[charIndex - 1])) {
        // We're in the middle of a word, find the start
        wordStart = findWordStart(extractedText, charIndex)
      } else {
        // We're already at a word start, use charIndex directly
        wordStart = charIndex
      }
    }
    
    // If playback is currently happening, stop it first
    const wasPlaying = isPlayingRef.current
    
    if (wasPlaying) {
      // Stop Google TTS audio if playing
      if (audioRef.current) {
        isCancelledRef.current = true
        audioRef.current.pause()
        audioRef.current = null
      }
      
      // Stop browser TTS if playing
      if (synthRef.current) {
        synthRef.current.cancel()
        utteranceRef.current = null
      }
      
      setIsPlaying(false)
      isPlayingRef.current = false
      clearReadingHighlight()
      
      // Reset boundary position tracking for clean restart
      previousBoundaryPositionRef.current = null
      
      // Update Media Session metadata
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused'
      }
    }
    
    // Update the start position
    setStartPosition(wordStart)
    startPositionRef.current = wordStart
    
    // Re-enable auto-scroll when user clicks a new position (they want to follow from there)
    // Mark the next scroll as programmatic to prevent immediate disable
    if (!autoScrollEnabledRef.current) {
      autoScrollEnabledRef.current = true
      isProgrammaticScrollRef.current = true
      lastProgrammaticScrollTimeRef.current = Date.now()
      setAutoScrollEnabled(true)
      // Reset the flag after a short delay to allow initial scroll to complete
      setTimeout(() => {
        isProgrammaticScrollRef.current = false
      }, 1200)
    } else {
      // Even if already enabled, mark next scroll as programmatic since we're jumping to new position
      isProgrammaticScrollRef.current = true
      lastProgrammaticScrollTimeRef.current = Date.now()
      setTimeout(() => {
        isProgrammaticScrollRef.current = false
      }, 1200)
    }
    
    // Mark the clicked word - use the clicked element directly if provided, otherwise search
    if (clickedElement && clickedElement.isConnected) {
      // Use the clicked element directly - this is the most accurate
      markStartPosition(clickedElement)
    } else {
      // Fallback: find the item that contains wordStart
      const currentTextItems = textItemsRef.current.length > 0 ? textItemsRef.current : textItems
      // Find the item that starts at or before wordStart and contains wordStart
      const clickedItem = currentTextItems.find(item => 
        item.charIndex <= wordStart && 
        item.charIndex + item.str.length > wordStart
      )
      
      // If no exact match, find the item that starts closest to wordStart
      if (!clickedItem) {
        const sortedItems = currentTextItems
          .filter(item => item.charIndex <= wordStart)
          .sort((a, b) => b.charIndex - a.charIndex)
        if (sortedItems.length > 0) {
          const closestItem = sortedItems[0]
          if (closestItem && closestItem.element) {
            markStartPosition(closestItem.element)
          }
        }
      } else if (clickedItem && clickedItem.element) {
        markStartPosition(clickedItem.element)
      }
    }
    
    // Always start reading immediately from the new position
    if (extractedText) {
      // Reset boundary tracking before starting
      previousBoundaryPositionRef.current = null
      
      // Start playback immediately - browser TTS will handle cancellation internally
      // Use requestAnimationFrame to ensure DOM updates are complete, but start immediately
      requestAnimationFrame(() => {
        startPlaybackFromPosition(wordStart).then(success => {
          if (!success) {
            setError('No text to read from the selected position.')
          }
        }).catch(error => {
          console.error('Error starting playback:', error)
          setError('Error starting playback: ' + error.message)
        })
      })
    }
  }

  // Update start position marker when startPosition or textItems change
  useEffect(() => {
    if (startPosition === 0) {
      clearStartMarker()
      return
    }

    // Find the text item that contains the start position
    const itemAtPosition = textItems.find(item => 
      item.charIndex <= startPosition && 
      item.charIndex + item.str.length >= startPosition
    )

    if (itemAtPosition && itemAtPosition.element) {
      // Check if element is still in DOM
      if (!itemAtPosition.element.isConnected) {
        // Element was removed, try to find it again by page and charIndex
        const pageNum = itemAtPosition.page
        const textLayer = textLayerRefs.current[pageNum]
        if (textLayer) {
          const newElement = textLayer.querySelector(`[data-char-index="${itemAtPosition.charIndex}"]`)
          if (newElement) {
            itemAtPosition.element = newElement
            markStartPosition(newElement)
            return
          }
        }
        // Couldn't find element, clear marker
        clearStartMarker()
        return
      }
      
      // Check if this is already the marked element
      if (markedStartElementRef.current !== itemAtPosition.element) {
        markStartPosition(itemAtPosition.element)
      } else {
        // Re-apply marker in case it was cleared (e.g., after re-render)
        if (!itemAtPosition.element.classList.contains('start-position-marker')) {
          markStartPosition(itemAtPosition.element)
        }
      }
    } else {
      // Element not found yet (might be rendering), clear marker for now
      clearStartMarker()
    }
  }, [startPosition, textItems])

  // Get the exact character index from a click event within a span
  const getExactCharIndexFromClick = (event, span, spanCharIndex) => {
    const textNode = span.firstChild
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      // Fallback: use the span's start index
      return spanCharIndex
    }
    
    // Try to get the character position at the click point
    let range = null
    if (document.caretRangeFromPoint) {
      // Modern browsers
      range = document.caretRangeFromPoint(event.clientX, event.clientY)
    } else if (document.caretPositionFromPoint) {
      // Firefox
      const caretPos = document.caretPositionFromPoint(event.clientX, event.clientY)
      if (caretPos) {
        range = document.createRange()
        range.setStart(caretPos.offsetNode, caretPos.offset)
        range.setEnd(caretPos.offsetNode, caretPos.offset)
      }
    } else {
      // Fallback: try to use selection if available
      const selection = window.getSelection()
      if (selection.rangeCount > 0) {
        range = selection.getRangeAt(0)
      }
    }
    
    if (range && span.contains(range.startContainer)) {
      // Calculate offset within the span's text node
      let offset = 0
      if (range.startContainer === textNode) {
        offset = range.startOffset
      } else if (span.contains(range.startContainer)) {
        // If the range starts in a child node, calculate the offset
        const spanRange = document.createRange()
        spanRange.selectNodeContents(span)
        spanRange.setEnd(range.startContainer, range.startOffset)
        offset = spanRange.toString().length
      }
      
      // Return the exact character index
      return spanCharIndex + Math.min(offset, textNode.textContent.length)
    }
    
    // Fallback: use the span's start index
    return spanCharIndex
  }

  const findWordStart = (text, position) => {
    if (position <= 0) return 0
    if (position >= text.length) return text.length
    
    let start = position
    
    // If we're in the middle of a word, find the start of that word
    if (/\S/.test(text[start])) {
      // We're in a word - move backwards to find word start
      while (start > 0 && /\S/.test(text[start - 1])) {
        start--
      }
      return start
    }
    
    // We're at whitespace - find the next word (don't go backwards)
    // This ensures we mark the word the user actually clicked on
    while (start < text.length && /\s/.test(text[start])) {
      start++
    }
    
    // If we found a word, return its start position
    // (start is already at the beginning of the word after skipping whitespace)
    return start
  }

  // Process PDF for AI features (chunking and embeddings)
  const processPDFForAI = async (docId, text, metadata) => {
    // Create basic document entry first, even if processing fails
    // This ensures highlights and other features can be saved
    const docRef = doc(db, 'users', currentUser.uid, 'documents', docId)
    try {
      await setDoc(docRef, {
        ...metadata,
        createdAt: new Date().toISOString(),
        processingStatus: 'processing'
      }, { merge: true })
    } catch (createError) {
      console.warn('Error creating document entry:', createError)
    }

    try {
      const processPdf = httpsCallable(functions, 'processPdf')
      const result = await processPdf({
        documentId: docId,
        text: text,
        metadata: metadata,
      })

      console.log('PDF processed for AI:', result.data)
      
      // Update document with success status
      await setDoc(docRef, {
        processingStatus: 'completed'
      }, { merge: true })
      
      return result
    } catch (error) {
      console.error('Error processing PDF for AI:', error)
      
      // Update document with error status, but keep it so highlights can be saved
      try {
        await setDoc(docRef, {
          processingStatus: 'failed',
          processingError: error.message
        }, { merge: true })
      } catch (updateError) {
        console.warn('Error updating document status:', updateError)
      }
      
      // Handle Firebase-specific errors
      if (error.code) {
        throw new Error(`Firebase error: ${error.message}`)
      }
      throw error
    }
  }

  // Generate timeline from PDF
  const generateTimeline = async (retryCount = 0, force = false) => {
    if (!documentId) {
      setTimelineError('No document loaded. Please upload a PDF first.')
      return
    }

    // If PDF is still processing, wait a bit and retry
    if (isPDFProcessing && retryCount < 10) {
      setTimeout(() => {
        generateTimeline(retryCount + 1, force)
      }, 500) // Wait 500ms and retry
      return
    }

    if (isPDFProcessing) {
      setTimelineError('PDF is still being processed. Please wait a moment and try again.')
      return
    }

    setIsTimelineLoading(true)
    setTimelineError(null)

    try {
      const generateTimelineFn = httpsCallable(functions, 'generateTimeline')
      const result = await generateTimelineFn({
        documentId: documentId,
      })

      const data = result.data
      
      if (!data.success) {
        // Couldn't generate timeline
        console.log('Timeline generation failed:', data);
        setTimelineError(data.message || 'Could not generate timeline from this document.')
        setTimeline(null)
        setTimelineIcons({})
        return
      }

      const newTimeline = data.timeline || []
      // Ensure timeline events have proper structure (order, importance, dates)
      const validatedTimeline = newTimeline.map((event, index) => ({
        ...event,
        order: event.order || index + 1,
        importance: event.importance || 'medium',
        // Ensure at least one date field exists (prefer existing date, fallback to placeholder)
        date: event.date || event.date_original_format || event.date_normalized || `Event ${index + 1}`
      })).sort((a, b) => (a.order || 0) - (b.order || 0)) // Sort by order
      
      setTimeline(validatedTimeline)
      
      // If icons are included in the response, store them
      const newIcons = data.icons && Object.keys(data.icons).length > 0 ? data.icons : {}
      setTimelineIcons(newIcons)
      
      if (Object.keys(newIcons).length > 0) {
        console.log(`Timeline loaded with ${Object.keys(newIcons).length} pre-generated icons`)
      }
      
      // Save validated timeline and icons to Firestore
      await updateDocumentField('timeline', validatedTimeline)
      await updateDocumentField('timelineIcons', newIcons)
    } catch (error) {
      console.error('Error generating timeline:', error)
      // Handle Firebase-specific errors
      const errorMessage = error.code ? `Firebase error: ${error.message}` : (error.message || 'Failed to generate timeline')
      setTimelineError(errorMessage)
      setTimeline(null)
      setTimelineIcons({})
    } finally {
      setIsTimelineLoading(false)
    }
  }

  // Generate characters from PDF
  const generateCharacters = async (retryCount = 0) => {
    if (!documentId) {
      setCharactersError('No document loaded. Please upload a PDF first.')
      return
    }

    // If PDF is still processing, wait a bit and retry
    if (isPDFProcessing && retryCount < 10) {
      setTimeout(() => {
        generateCharacters(retryCount + 1)
      }, 500) // Wait 500ms and retry
      return
    }

    if (isPDFProcessing) {
      setCharactersError('PDF is still being processed. Please wait a moment and try again.')
      return
    }

    setIsCharactersLoading(true)
    setCharactersError(null)

    try {
      const generateCharactersFn = httpsCallable(functions, 'generateCharacters')
      const result = await generateCharactersFn({
        documentId: documentId,
      })

      const data = result.data
      
      // Check if we have characters data (even if success field is missing)
      if (data.characters && Array.isArray(data.characters) && data.characters.length > 0) {
        setCharacters(data)
        return
      }
      
      if (!data.success) {
        console.log('Characters extraction failed:', data)
        setCharactersError(data.message || 'Could not extract characters from this document.')
        setCharacters(null)
        return
      }

      setCharacters(data)
    } catch (error) {
      console.error('Error extracting characters:', error)
      // Handle Firebase-specific errors
      const errorMessage = error.code ? `Firebase error: ${error.message}` : (error.message || 'Failed to extract characters')
      setCharactersError(errorMessage)
      setCharacters(null)
    } finally {
      setIsCharactersLoading(false)
    }
  }

  // Download timeline as HTML
  const downloadTimelineAsHTML = () => {
    if (!timeline || timeline.length === 0) {
      return
    }

    // Helper functions from ProportionalTimeline
    const getBestDate = (event) => {
      return (
        event?.date ||
        event?.date_original_format ||
        event?.date_normalized ||
        null
      )
    }

    const parseDateToTimestamp = (dateStr, index) => {
      if (!dateStr) return index * 1000

      const str = dateStr.toLowerCase().trim()
      const ddmmyyyy = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
      if (ddmmyyyy) {
        const [, day, month, year] = ddmmyyyy
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime()
      }

      const mmyyyy = str.match(/(\d{1,2})\/(\d{4})/)
      if (mmyyyy) {
        const [, month, year] = mmyyyy
        return new Date(parseInt(year), parseInt(month) - 1, 1).getTime()
      }

      const yyyy = str.match(/(\d{4})/)
      if (yyyy) {
        return new Date(parseInt(yyyy[1]), 0, 1).getTime()
      }

      const parsed = Date.parse(dateStr)
      if (!isNaN(parsed)) {
        return parsed
      }

      const numbers = str.match(/\d+/)
      if (numbers) {
        const num = parseInt(numbers[0])
        if (str.includes('day')) {
          return num * 86400000
        }
        if (str.includes('year')) {
          return new Date(num, 0, 1).getTime()
        }
        return num * 86400000
      }

      return index * 1000
    }

    const formatDateForDisplay = (dateStr, index) => {
      if (!dateStr) return `Event ${index + 1}`

      if (
        /\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr) ||
        /\d{1,2}\/\d{4}/.test(dateStr) ||
        /^\d{4}$/.test(dateStr)
      ) {
        return dateStr
      }

      const timestamp = parseDateToTimestamp(dateStr, index)
      if (timestamp && timestamp !== index * 1000) {
        const date = new Date(timestamp)
        if (!isNaN(date.getTime())) {
          const hasDay = /\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)
          const hasMonth = /\d{1,2}\/\d{4}/.test(dateStr)

          if (hasDay) {
            const day = date.getDate()
            const month = date.getMonth() + 1
            const year = date.getFullYear()
            return `${day}/${month}/${year}`
          } else if (hasMonth) {
            const month = date.getMonth() + 1
            const year = date.getFullYear()
            return `${month}/${year}`
          } else if (/^\d{4}$/.test(dateStr)) {
            return dateStr
          } else {
            return date.getFullYear().toString()
          }
        }
      }

      return dateStr || `Event ${index + 1}`
    }

    const getBriefDescription = (text, maxWords = 4) => {
      if (!text) return ''
      const sentenceEnd = text.indexOf('.')
      const trimmed = sentenceEnd > 0 ? text.slice(0, sentenceEnd) : text
      const words = trimmed.split(' ').slice(0, maxWords * 3)
      return words.join(' ')
    }

    // Calculate layout (similar to ProportionalTimeline)
    const eventsWithTimestamps = timeline.map((event, index) => {
      const rawDate = getBestDate(event)
      return {
        ...event,
        rawDate,
        timestamp: parseDateToTimestamp(rawDate, index),
        originalIndex: index
      }
    })

    const timestamps = eventsWithTimestamps.map((e) => e.timestamp)
    const minTimestamp = Math.min(...timestamps)
    const maxTimestamp = Math.max(...timestamps)
    const timeRange = maxTimestamp - minTimestamp || 1

    const leftMarginPx = 200
    const rightMarginPx = 200
    const viewport = 1200 // Fixed width for HTML export
    const baseInnerLength = Math.max(viewport - leftMarginPx - rightMarginPx, 400)

    const positioned = eventsWithTimestamps.map((event, idx) => {
      const normalized = timeRange === 0 ? 0.5 : (event.timestamp - minTimestamp) / timeRange
      const idealX = leftMarginPx + normalized * baseInnerLength
      const displayDate = formatDateForDisplay(event.rawDate, idx)
      return {
        ...event,
        position: normalized,
        idealX,
        displayDate
      }
    })

    const minGapPx = 190
    const sorted = [...positioned].sort((a, b) => a.idealX - b.idealX)
    let lastX = -Infinity
    const xs = []

    sorted.forEach((event) => {
      let x = event.idealX
      if (x - lastX < minGapPx) {
        x = lastX + minGapPx
      }
      lastX = x
      xs.push({ event, x })
    })

    const minTotalLength = leftMarginPx + baseInnerLength + rightMarginPx
    let effectiveLength = Math.max(minTotalLength, (lastX || minTotalLength) + rightMarginPx)

    const layoutMap = new Map()
    xs.forEach(({ event, x }) => {
      const normalized = effectiveLength > 0 ? x / effectiveLength : event.position
      layoutMap.set(event.originalIndex, normalized)
    })

    const laidOutEvents = positioned.map((event) => ({
      ...event,
      layoutPosition: layoutMap.get(event.originalIndex) ?? event.position
    }))

    // Group events by stage
    const eventsWithStages = laidOutEvents.filter(e => e.stage && e.stage !== null)
    const stageMap = new Map()
    laidOutEvents.forEach((event, index) => {
      if (event.stage && event.stage !== null) {
        if (!stageMap.has(event.stage)) {
          stageMap.set(event.stage, [])
        }
        stageMap.get(event.stage).push({ event, index })
      }
    })

    const seenStages = new Set()
    const stageBoundaries = []
    laidOutEvents.forEach((event, index) => {
      if (event.stage && event.stage !== null && !seenStages.has(event.stage)) {
        seenStages.add(event.stage)
        stageBoundaries.push({
          stage: event.stage,
          position: event.layoutPosition ?? event.position,
          index
        })
      }
    })
    stageBoundaries.sort((a, b) => a.position - b.position)

    // Generate HTML
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Story Timeline - ${pdfFile?.name || 'Document'}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'SF Pro Text', 'Helvetica Neue', sans-serif;
      background: #101114;
      color: #e8eaed;
      padding: 2rem;
      min-height: 100vh;
    }

    .timeline-container {
      max-width: 1400px;
      margin: 0 auto;
    }

    .timeline-header {
      margin-bottom: 2rem;
      text-align: center;
    }

    .timeline-header h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #e8eaed;
    }

    .timeline-header .event-count {
      font-size: 0.9rem;
      color: #9aa0a6;
      background: rgba(154, 160, 166, 0.12);
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      display: inline-block;
    }

    .proportional-timeline-container {
      position: relative;
      width: 100%;
      padding: 5rem 6rem 4rem 6rem;
      overflow-x: auto;
      overflow-y: visible;
      background: #101114;
    }

    .timeline-track {
      position: relative;
      width: ${effectiveLength}px;
      min-height: 400px;
      height: 400px;
    }

    .timeline-horizontal-line {
      position: absolute;
      top: 50%;
      left: 0;
      right: 0;
      transform: translateY(-50%);
      height: 2px;
      background: linear-gradient(
        to right,
        rgba(138, 180, 248, 0.05),
        rgba(138, 180, 248, 0.65),
        rgba(138, 180, 248, 0.05)
      );
      border-radius: 999px;
      z-index: 1;
    }

    .timeline-stage-separators {
      position: absolute;
      inset: 0;
      z-index: 1;
      pointer-events: none;
    }

    .timeline-stage-separator {
      position: absolute;
      top: 0;
      bottom: 0;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .timeline-stage-separator-line {
      width: 1px;
      height: 100%;
      background: linear-gradient(
        to bottom,
        transparent,
        rgba(138, 180, 248, 0.2) 20%,
        rgba(138, 180, 248, 0.2) 80%,
        transparent
      );
    }

    .timeline-stage-labels {
      position: absolute;
      top: -4.5rem;
      left: 0;
      right: 0;
      height: 1.5rem;
      z-index: 1;
      pointer-events: none;
    }

    .timeline-stage-label-start {
      position: absolute;
      transform: translateX(-50%);
      font-size: 0.7rem;
      color: rgba(154, 160, 166, 0.5);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      white-space: nowrap;
      padding: 0.15rem 0.4rem;
      background: rgba(16, 17, 20, 0.6);
      border-radius: 3px;
      border: 1px solid rgba(95, 99, 104, 0.2);
    }

    .timeline-events-container {
      position: absolute;
      inset: 0;
      z-index: 2;
    }

    .timeline-event-marker {
      position: absolute;
      top: 0;
      bottom: 0;
      transform: translateX(-50%);
      display: block;
    }

    .timeline-dot-small {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid #8ab4f8;
      background: #101114;
      box-shadow: 0 0 0 2px rgba(138, 180, 248, 0.3);
      z-index: 3;
    }

    .timeline-dot-small.importance-high {
      width: 20px;
      height: 20px;
      border-width: 3px;
      border-color: #8ab4f8;
      background: linear-gradient(135deg, rgba(138, 180, 248, 0.15), rgba(138, 180, 248, 0.05));
      box-shadow: 
        0 0 0 4px rgba(138, 180, 248, 0.5),
        0 0 0 7px rgba(138, 180, 248, 0.25),
        0 0 20px rgba(138, 180, 248, 0.5),
        0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 4;
    }

    .timeline-dot-small.importance-medium {
      width: 12px;
      height: 12px;
      border-width: 2px;
    }

    .timeline-dot-small.importance-low {
      width: 10px;
      height: 10px;
      border-width: 1.5px;
      border-color: rgba(138, 180, 248, 0.6);
      opacity: 0.75;
    }

    .timeline-event-label {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      width: 180px;
      max-width: 180px;
      min-width: 180px;
      padding: 0.35rem 0.6rem;
      border-radius: 8px;
      background: rgba(25, 26, 30, 0.95);
      border: 1px solid rgba(95, 99, 104, 0.7);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      overflow: hidden;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .timeline-event-label.label-above {
      bottom: calc(50% + 16px);
    }

    .timeline-event-label.label-below {
      top: calc(50% + 16px);
    }

    .timeline-event-label.importance-high {
      border-color: #8ab4f8;
      border-width: 2px;
      background: linear-gradient(135deg, rgba(25, 26, 30, 0.98), rgba(20, 21, 25, 0.95));
      box-shadow: 
        0 6px 20px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(138, 180, 248, 0.3),
        0 0 15px rgba(138, 180, 248, 0.2);
    }

    .timeline-event-label.importance-high.label-above {
      bottom: calc(50% + 20px);
    }

    .timeline-event-label.importance-high.label-below {
      top: calc(50% + 20px);
    }

    .timeline-event-label.importance-low {
      opacity: 0.7;
      border-color: rgba(95, 99, 104, 0.5);
    }

    .timeline-event-date {
      font-size: 0.825rem;
      font-weight: 600;
      color: #e8eaed;
      margin-bottom: 0.15rem;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .timeline-event-label.importance-high .timeline-event-date {
      font-weight: 700;
      font-size: 0.875rem;
      color: #ffffff;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }

    .timeline-event-label.importance-low .timeline-event-date {
      font-weight: 500;
      color: #9aa0a6;
    }

    .timeline-event-brief {
      font-size: 0.825rem;
      color: #9aa0a6;
      white-space: normal;
      word-wrap: break-word;
      overflow-wrap: break-word;
      line-height: 1.4;
    }

    .timeline-event-label.importance-high .timeline-event-brief {
      color: #d1d5db;
      font-weight: 500;
    }

    .timeline-event-label.importance-low .timeline-event-brief {
      color: #80868b;
    }

    .timeline-event-icon {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      width: 64px;
      height: 64px;
      z-index: 3;
      pointer-events: none;
      opacity: 0.95;
      filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
      background: transparent !important;
    }

    .timeline-event-icon svg {
      width: 100%;
      height: 100%;
      display: block;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 2px rgba(138, 180, 248, 0.3));
      background: transparent !important;
    }

    .timeline-event-icon.icon-above {
      bottom: calc(50% + 130px);
    }

    .timeline-event-icon.icon-below {
      top: calc(50% + 130px);
    }

    .timeline-event-label {
      cursor: pointer;
      transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .timeline-event-label:hover {
      transform: translateX(-50%) translateY(-1px);
      border-color: #8ab4f8;
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.45);
    }

    .timeline-dot-small {
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .timeline-dot-small:hover {
      transform: translate(-50%, -50%) scale(1.2);
    }

    .timeline-event-details-tooltip {
      position: absolute;
      min-width: 260px;
      max-width: 360px;
      background: #202124;
      border-radius: 12px;
      border: 1px solid #5f6368;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
      padding: 0.75rem 0.9rem 0.9rem 0.9rem;
      z-index: 40;
      color: #e8eaed;
      display: none;
    }

    .timeline-event-details-tooltip.visible {
      display: block;
    }

    .tooltip-close {
      position: absolute;
      top: 0.4rem;
      right: 0.4rem;
      background: transparent;
      border: none;
      color: #9aa0a6;
      cursor: pointer;
      width: 22px;
      height: 22px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      line-height: 1;
      transition: background 0.2s ease, color 0.2s ease;
    }

    .tooltip-close:hover {
      background: rgba(255, 255, 255, 0.06);
      color: #e8eaed;
    }

    .tooltip-close::before {
      content: '×';
    }

    .tooltip-header {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      margin-bottom: 0.45rem;
      padding-right: 1.3rem;
    }

    .tooltip-date {
      font-size: 0.825rem;
      color: #9aa0a6;
    }

    .tooltip-title {
      font-size: 0.99rem;
      font-weight: 600;
      color: #e8eaed;
    }

    .tooltip-description {
      font-size: 0.88rem;
      color: #e8eaed;
      line-height: 1.4;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  </style>
</head>
<body>
  <div class="timeline-container">
    <div class="timeline-header">
      <h1>Story Timeline</h1>
      <span class="event-count">${timeline.length} events</span>
    </div>
    <div class="proportional-timeline-container">
      <div class="timeline-track" id="timeline-track">
        <div class="timeline-horizontal-line"></div>
        ${stageBoundaries.length > 0 ? `
        <div class="timeline-stage-separators">
          ${stageBoundaries.map((boundary, idx) => {
            if (idx === 0) return ''
            const leftPercent = boundary.position * 100
            return `
            <div class="timeline-stage-separator" style="left: ${leftPercent}%">
              <div class="timeline-stage-separator-line"></div>
            </div>`
          }).join('')}
        </div>
        <div class="timeline-stage-labels">
          ${stageBoundaries.map((boundary, idx) => {
            let centerPosition
            if (idx === 0) {
              const nextPosition = stageBoundaries.length > 1 ? stageBoundaries[1].position : 1.0
              centerPosition = (0 + nextPosition) / 2
            } else if (idx === stageBoundaries.length - 1) {
              centerPosition = (boundary.position + 1.0) / 2
            } else {
              const nextPosition = stageBoundaries[idx + 1].position
              centerPosition = (boundary.position + nextPosition) / 2
            }
            const leftPercent = centerPosition * 100
            return `
            <div class="timeline-stage-label-start" style="left: ${leftPercent}%">
              ${boundary.stage}
            </div>`
          }).join('')}
        </div>
        ` : ''}
        <div class="timeline-events-container">
          ${laidOutEvents.map((event, index) => {
            const leftPercent = (event.layoutPosition ?? event.position) * 100
            const isAbove = index % 2 === 0
            const importance = event.importance || 'medium'
            const importanceClass = `importance-${importance.toLowerCase()}`
            const isRemarkable = importance.toLowerCase() === 'high'
            const eventIcon = timelineIcons[index]
            const briefDescription = getBriefDescription(event.event || event.description, 4)

            return `
            <div class="timeline-event-marker ${isAbove ? 'above' : 'below'} ${importanceClass}" style="left: ${leftPercent}%" data-event-index="${index}">
              ${isRemarkable && eventIcon ? `
              <div class="timeline-event-icon ${isAbove ? 'icon-above' : 'icon-below'}" style="background-color: transparent;">
                ${eventIcon}
              </div>
              ` : ''}
              <div class="timeline-event-label ${isAbove ? 'label-above' : 'label-below'} ${importanceClass}" data-event-index="${index}">
                <div class="timeline-event-date">
                  ${event.displayDate || event.date || `Event ${event.order || index + 1}`}
                </div>
                <div class="timeline-event-brief">
                  ${briefDescription}
                </div>
              </div>
              <div class="timeline-dot-small ${importanceClass}" data-event-index="${index}"></div>
            </div>`
          }).join('')}
        </div>
        <!-- Tooltip container -->
        <div class="timeline-event-details-tooltip" id="event-tooltip">
          <button class="tooltip-close" id="tooltip-close"></button>
          <div class="tooltip-header">
            <div class="tooltip-date" id="tooltip-date"></div>
            <div class="tooltip-title" id="tooltip-title"></div>
          </div>
          <div class="tooltip-description" id="tooltip-description"></div>
        </div>
      </div>
    </div>
  </div>
  <script>
    (function() {
      const track = document.getElementById('timeline-track');
      const tooltip = document.getElementById('event-tooltip');
      const tooltipDate = document.getElementById('tooltip-date');
      const tooltipTitle = document.getElementById('tooltip-title');
      const tooltipDescription = document.getElementById('tooltip-description');
      const tooltipClose = document.getElementById('tooltip-close');
      let selectedEventIndex = null;

      // Event data stored in data attributes
      const eventData = ${JSON.stringify(laidOutEvents.map((event, index) => ({
        index,
        displayDate: event.displayDate || event.date || '',
        title: event.event || `Event ${event.order || index + 1}`,
        description: event.description || event.event || 'No description available.'
      })))};

      function showTooltip(eventIndex, element) {
        const event = eventData[eventIndex];
        if (!event) return;

        // Update tooltip content
        tooltipDate.textContent = event.displayDate || '';
        tooltipTitle.textContent = event.title;
        tooltipDescription.textContent = event.description;

        // Position tooltip
        const rect = element.getBoundingClientRect();
        const containerRect = track.getBoundingClientRect();
        
        const spaceAbove = rect.top - containerRect.top;
        const spaceBelow = containerRect.bottom - rect.bottom;
        const isAbove = spaceAbove > spaceBelow;

        tooltip.style.top = isAbove
          ? (rect.top - containerRect.top - 10) + 'px'
          : (rect.bottom - containerRect.top + 10) + 'px';
        tooltip.style.left = (rect.left + rect.width / 2 - containerRect.left) + 'px';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.classList.add('visible');
        selectedEventIndex = eventIndex;
      }

      function hideTooltip() {
        tooltip.classList.remove('visible');
        selectedEventIndex = null;
      }

      // Handle clicks on event labels and dots
      function handleEventClick(e) {
        const eventIndex = parseInt(e.target.getAttribute('data-event-index'));
        if (isNaN(eventIndex)) return;

        // Find the event marker element
        const eventMarker = e.target.closest('.timeline-event-marker');
        if (!eventMarker) return;

        // Find the dot element for positioning
        const dot = eventMarker.querySelector('.timeline-dot-small');
        if (!dot) return;

        if (selectedEventIndex === eventIndex) {
          hideTooltip();
        } else {
          showTooltip(eventIndex, dot);
        }
      }

      // Attach click handlers
      document.querySelectorAll('.timeline-event-label, .timeline-dot-small').forEach(el => {
        el.addEventListener('click', handleEventClick);
      });

      // Close tooltip button
      tooltipClose.addEventListener('click', function(e) {
        e.stopPropagation();
        hideTooltip();
      });

      // Close tooltip when clicking outside
      document.addEventListener('click', function(e) {
        if (!tooltip.contains(e.target) && !e.target.closest('.timeline-event-marker')) {
          hideTooltip();
        }
      });
    })();
  </script>
</body>
</html>`

    // Create blob and download
    const blob = new Blob([htmlContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timeline-${pdfFile?.name?.replace(/\.[^/.]+$/, '') || 'document'}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Generate timeline when timeline tab is opened
  useEffect(() => {
    if (sidebarView === 'timeline' && documentId && !timeline && !isTimelineLoading && !timelineError && !isPDFProcessing) {
      generateTimeline()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarView, documentId, isPDFProcessing])

  // Generate characters when characters tab is opened
  useEffect(() => {
    if (sidebarView === 'characters' && documentId && !characters && !isCharactersLoading && !charactersError && !isPDFProcessing) {
      generateCharacters()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarView, documentId, isPDFProcessing])

  // Auto-minimize controls when timeline is expanded
  useEffect(() => {
    if (isTimelineExpanded && !isControlsPanelMinimized) {
      setIsControlsPanelMinimized(true)
    }
  }, [isTimelineExpanded])

  // Helper function to reset speech synthesis state (fixes Chrome issues)
  const resetSpeechSynthesis = () => {
    if (!synthRef.current) return
    
    // Cancel any pending speech
    synthRef.current.cancel()
    utteranceRef.current = null
    
    // Chrome sometimes gets stuck - try to reset by getting a fresh reference
    // This helps when speech synthesis is in a bad state
    try {
      // Force Chrome to reset by accessing the API in a new way
      if (window.speechSynthesis) {
        // Cancel all pending utterances
        window.speechSynthesis.cancel()
        // Minimal delay to let Chrome process the cancellation (reduced for faster response)
        return new Promise(resolve => setTimeout(resolve, 10))
      }
    } catch (e) {
      console.warn('Error resetting speech synthesis:', e)
    }
    return Promise.resolve()
  }

  // Helper function to check if speech synthesis is in a good state
  const isSpeechSynthesisReady = () => {
    if (!synthRef.current) return false
    
    // Check if speech synthesis is available and not stuck
    try {
      // Chrome can get stuck in speaking/pending state even when not actually speaking
      // We'll be lenient and allow it if it's been a while since last activity
      return true
    } catch (e) {
      return false
    }
  }

  // Helper function to start playback from a specific position
  const startPlaybackFromPosition = async (position) => {
    
    if (!extractedText) return false
    
    // Prevent multiple simultaneous playback attempts using a ref guard
    if (playbackInProgressRef.current) {
      return false // Reject duplicate calls
    }
    
    // Set guard immediately to prevent race conditions
    playbackInProgressRef.current = true
    
    // Cancel any existing playback first
    if (synthRef.current) {
      synthRef.current.cancel()
      utteranceRef.current = null
    }
    // Wait a bit for cancellation to complete
    await new Promise(resolve => setTimeout(resolve, 100))

    // Update the current playback position ref
    currentPlaybackPositionRef.current = position
    playbackStartPositionRef.current = position
    playbackStartTimeRef.current = Date.now()
    lastBoundaryPositionRef.current = position

    // Determine language to use
    let langToUse = language
    if (language === 'auto') {
      langToUse = detectedLanguage || detectLanguage(extractedText) || 'en'
    }
    
    // Get text from specified position to end
    const textToRead = extractedText.substring(position).trim()
    
    if (!textToRead) {
      return false
    }

    // Capture textItems state in closure for use in boundary handler
    // Use textItems state if available, otherwise try to build from DOM as fallback
    let textItemsState = textItems || []
    
    // If textItems state is empty, try to build from DOM (pages might not be fully rendered yet)
    if (textItemsState.length === 0) {
      const allTextLayers = Object.values(textLayerRefs.current).filter(Boolean)
      const domTextItems = []
      allTextLayers.forEach(textLayer => {
        const spans = textLayer.querySelectorAll('span[data-char-index]')
        spans.forEach(span => {
          const charIndex = parseInt(span.dataset.charIndex, 10)
          if (!isNaN(charIndex) && charIndex >= 0) {
            const text = span.textContent || ''
            if (text.trim().length > 0) {
              // Split text into words
              const words = []
              let currentWord = ''
              for (let i = 0; i < text.length; i++) {
                const char = text[i]
                if (/\w/.test(char)) {
                  currentWord += char
                } else {
                  if (currentWord.length > 0) {
                    words.push(currentWord)
                    currentWord = ''
                  }
                  words.push(char)
                }
              }
              if (currentWord.length > 0) {
                words.push(currentWord)
              }
              
              let wordOffset = 0
              words.forEach(word => {
                const wordCharIndex = charIndex + wordOffset
                domTextItems.push({
                  str: word,
                  page: parseInt(span.dataset.page || '1', 10),
                  charIndex: wordCharIndex,
                  element: span
                })
                wordOffset += word.length
              })
            }
          }
        })
      })
      if (domTextItems.length > 0) {
        textItemsState = domTextItems.sort((a, b) => a.charIndex - b.charIndex)
      }
    }

    // Use browser TTS for all languages
    console.log('Starting playback, language:', langToUse, 'text length:', textToRead.length)
    console.log('Using browser TTS for', langToUse === 'es' ? 'Spanish' : 'English', 'text')
      if (!synthRef.current) {
        setError('Text-to-speech is not available in your browser.')
        return false
      }

      // Reset speech synthesis state to fix Chrome issues FIRST
      // This prevents multiple simultaneous playback attempts
      await resetSpeechSynthesis()
      
      // Set playing state immediately AFTER reset (don't wait for utterance.onstart)
      // This ensures the pause button appears immediately
      setIsPlaying(true)
      isPlayingRef.current = true
      
      // Check if speech synthesis is ready
      if (!isSpeechSynthesisReady()) {
        setError('Speech synthesis is not ready. Please try again.')
        setIsPlaying(false)
        isPlayingRef.current = false
        playbackInProgressRef.current = false // Clear guard
        return false
      }

      // Split text into segments with header detection
      const segments = splitTextForBrowserTTS(textToRead, documentId)
      const headerCount = segments.filter(s => s.isHeader).length
      console.log(`Split text into ${segments.length} segments for browser TTS, ${headerCount} headers detected`)
      if (headerCount > 0) {
        console.log('Headers found:', segments.filter(s => s.isHeader).map(s => `"${s.text.substring(0, 50)}${s.text.length > 50 ? '...' : ''}"`))
      }

      // Track if utterance actually starts (Chrome can silently reject)
      let utteranceStarted = false
      let utteranceStartTimeout = null
      let currentSegmentIndex = 0
      let totalTextOffset = 0 // Track position in original textToRead
      
      // Function to speak next segment
      const speakNextSegment = () => {
        
        if (currentSegmentIndex >= segments.length) {
          // All segments done
          setIsPlaying(false)
          currentPlaybackPositionRef.current = position + textToRead.length
          playbackStartTimeRef.current = null
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused'
          }
          return
        }

        const segment = segments[currentSegmentIndex]
        if (!segment.text || segment.text.trim().length === 0) {
          currentSegmentIndex++
          speakNextSegment()
          return
        }

        // Create utterance for this segment
        const utterance = new SpeechSynthesisUtterance(segment.text)
        utterance.lang = langToUse === 'es' ? 'es-ES' : 'en-US'
        utterance.rate = playbackSpeed
        utterance.pitch = 1.0
        utterance.volume = 1.0

        // Calculate segment start position in original text
        const segmentStartInText = totalTextOffset
        totalTextOffset += segment.text.length + (currentSegmentIndex < segments.length - 1 ? 1 : 0) // +1 for space/newline between segments

        // Track position using boundary events (fires when speaking each word)
        utterance.onboundary = (event) => {
          if (event.name === 'word' || event.name === 'sentence') {
            
            // ELEGANT SOLUTION: Don't trust TTS position data - use it only to identify the word being spoken
            // Then find the next matching word in our sequential textItems array
            
            const normalizeWord = (str) => str.trim().toLowerCase().replace(/[^\w]/g, '')
            
            // Extract the word being spoken from segment text
            const getWordAt = (text, pos) => {
              if (pos < 0 || pos >= text.length) return null
              let start = pos
              let end = pos
              while (start > 0 && /\S/.test(text[start - 1])) start--
              while (end < text.length && /\S/.test(text[end])) end++
              return text.substring(start, end)
            }
            
            // Get the word being spoken (this is reliable - TTS correctly identifies words)
            const spokenWord = getWordAt(segment.text, event.charIndex)
            if (!spokenWord) {
              return // Invalid event
            }
            
            const spokenWordNormalized = normalizeWord(spokenWord)
            if (!spokenWordNormalized) {
              return // Empty word
            }
            
            // Find the next matching word in our textItems array (forward from last highlighted)
            // CRITICAL: Use textItemsRef if available, otherwise use textItemsState from closure
            // If both are empty, we'll use a direct DOM search by text content (fallback below)
            let textItems = textItemsRef.current
            if (!textItems || textItems.length === 0) {
              // Use textItemsState from closure - this was captured at playback start
              textItems = textItemsState || []
            }
            
            if (!textItems || textItems.length === 0) {
              // Still empty after fallback - can't highlight
              return
            }
            
            // Get the starting point: last highlighted charIndex, or start of textToRead
            // CRITICAL: Use the actual start position, not position + segmentStartInText
            // segmentStartInText might be 0 or incorrect, causing wrong initial search
            const startCharIndex = lastHighlightedCharIndexRef.current !== null 
              ? lastHighlightedCharIndexRef.current 
              : position
          
          // CRITICAL: Get current page to prevent cross-page jumps
          const currentPage = currentReadingPageRef.current !== null 
            ? currentReadingPageRef.current 
            : (lastHighlightedElementRef.current ? getElementPageNumber(lastHighlightedElementRef.current) : null)
          
          // Check if we're at a page boundary (within last 50 chars of current page)
          let isAtPageBoundary = false
          let maxCharIndexOnCurrentPage = null
          if (currentPage !== null) {
            const currentPageItems = textItems.filter(item => {
              if (!item.element || !item.element.isConnected) return false
              const itemPage = getElementPageNumber(item.element)
              return itemPage === currentPage
            })
            if (currentPageItems.length > 0) {
              maxCharIndexOnCurrentPage = Math.max(...currentPageItems.map(i => i.charIndex + (i.str?.length || 0)))
              // Consider at boundary if within 50 chars of page end
              isAtPageBoundary = startCharIndex >= maxCharIndexOnCurrentPage - 50
            }
          }
          
          // ZERO LAG SOLUTION: Highlight the word that TTS is speaking RIGHT NOW
          // TTS boundary events fire when STARTING to speak a word, so we should highlight that word
          
          // Find all forward WORD items (ignore spaces/punctuation)
          // CRITICAL: Filter by page to prevent cross-page jumps
          // CRITICAL: When lastHighlightedCharIndexRef is null (first boundary), allow words AT startCharIndex
          const isFirstBoundary = lastHighlightedCharIndexRef.current === null
          const allForwardWordItems = textItems
            .filter(item => {
              if (!item.element || !item.element.isConnected || !item.str) return false
              
              // For first boundary, allow words at or after startCharIndex
              // For subsequent boundaries, only allow words after startCharIndex
              if (isFirstBoundary) {
                // First boundary: allow words that contain startCharIndex or start after it
                if (item.charIndex + item.str.length <= startCharIndex) return false
              } else {
                // Subsequent boundaries: only allow words after startCharIndex
                if (item.charIndex <= startCharIndex) return false
              }
              
              // Only consider word items (not spaces/punctuation)
              if (!/\S/.test(item.str) || normalizeWord(item.str).length === 0) return false
              
              // CRITICAL: Page filtering - only allow items on current page unless at boundary
              if (currentPage !== null) {
                const itemPage = getElementPageNumber(item.element)
                if (isAtPageBoundary) {
                  // At boundary - allow current page and next page only
                  if (itemPage !== currentPage && itemPage !== currentPage + 1) {
                    return false
                  }
                } else {
                  // Not at boundary - only allow current page
                  if (itemPage !== currentPage) {
                    return false
                  }
                }
              } else if (isFirstBoundary) {
                // First boundary and no current page - initialize page from the word at position
                // This ensures we start on the correct page
                const itemPage = getElementPageNumber(item.element)
                // Only allow items on the same page as the word at startCharIndex
                const itemsAtStart = textItems.filter(i => 
                  i.charIndex <= startCharIndex && i.charIndex + (i.str?.length || 0) > startCharIndex
                )
                if (itemsAtStart.length > 0) {
                  const startPage = getElementPageNumber(itemsAtStart[0].element)
                  if (startPage !== null && itemPage !== startPage) {
                    return false
                  }
                }
              }
              
              return true
            })
            .sort((a, b) => a.charIndex - b.charIndex)
          
          if (allForwardWordItems.length === 0) {
            
            // Log for debugging
            console.log('[TTS Boundary] No forward word items found in textItems, trying direct DOM search', {
              startCharIndex,
              currentPage,
              isAtPageBoundary,
              lastHighlightedCharIndex: lastHighlightedCharIndexRef.current
            })
            
            // FALLBACK: Try to find the word directly in the DOM using reliablePosition
            // Calculate reliablePosition: position (start of textToRead) + segmentStartInText (offset of segment) + event.charIndex (offset within segment)
            // segmentStartInText is already calculated above and is in scope
            const reliablePosition = position + segmentStartInText + event.charIndex
            
            // Find word boundaries at reliablePosition
            if (extractedText && reliablePosition >= 0 && reliablePosition < extractedText.length) {
              let wordStart = reliablePosition
              let wordEnd = reliablePosition
              while (wordStart > 0 && /\S/.test(extractedText[wordStart - 1])) wordStart--
              while (wordEnd < extractedText.length && /\S/.test(extractedText[wordEnd])) wordEnd++
              
              // Use findWordSpans to find spans containing this word (it searches by text content as fallback)
              const wordSpans = findWordSpans(reliablePosition, null)
              
              if (wordSpans.length > 0) {
                // Found spans - highlight directly using reliablePosition
                const firstSpan = wordSpans[0]
                const elementPage = getElementPageNumber(firstSpan)
                
                // Update tracking refs
                currentPlaybackPositionRef.current = reliablePosition
                lastBoundaryPositionRef.current = reliablePosition
                previousBoundaryPositionRef.current = reliablePosition
                if (elementPage !== null) {
                  currentReadingPageRef.current = elementPage
                }
                lastValidHighlightPositionRef.current = reliablePosition
                lastHighlightedCharIndexRef.current = reliablePosition
                lastHighlightedElementRef.current = firstSpan
                
                // Apply highlight directly
                applyReadingHighlight(firstSpan, false, reliablePosition)
                return // Successfully highlighted using DOM fallback
              } else {
              }
            } else {
            }
            
            // If DOM fallback also failed, return (can't highlight)
            return
          }
          
          // Find the word that TTS is speaking RIGHT NOW
          // Strategy: Search for the spoken word within a reasonable window (8 words)
          // This handles out-of-order TTS events while preventing large jumps
          let targetItem = null
          
          const immediateNextWordItem = allForwardWordItems[0]
          
          // Priority 1: Check immediate next word (most common, zero lag)
          const immediateNextWordNormalized = normalizeWord(immediateNextWordItem.str)
          if (immediateNextWordNormalized === spokenWordNormalized) {
            targetItem = immediateNextWordItem
          }
          
          // Priority 2: Search next 8 words for a match (handles out-of-order events)
          // Only accept matches within 8 words to prevent skipping too many words
          // This window is large enough to catch most out-of-order events but small enough
          // to prevent jumping to distant repeated words
          if (!targetItem) {
            const maxSearchWindow = Math.min(8, allForwardWordItems.length)
            for (let i = 1; i < maxSearchWindow; i++) {
              const candidateItem = allForwardWordItems[i]
              const candidateWordNormalized = normalizeWord(candidateItem.str)
              if (candidateWordNormalized === spokenWordNormalized) {
                targetItem = candidateItem
                // Found a match within reasonable distance - use it
                break
              }
            }
          }
          
          // Priority 3: Check if we're continuing the same word
          if (!targetItem && lastHighlightedCharIndexRef.current !== null && lastHighlightedElementRef.current !== null) {
            const lastWord = normalizeWord(lastHighlightedElementRef.current.textContent || '')
            if (lastWord === spokenWordNormalized) {
              // Same word - continue highlighting it
              const sameItem = textItems.find(item => 
                item.element === lastHighlightedElementRef.current &&
                item.charIndex === lastHighlightedCharIndexRef.current
              )
              if (sameItem) {
                targetItem = sameItem
              }
            }
          }
          
          // Priority 4: Fallback - advance to immediate next word (prevents getting stuck)
          // Only use this if we truly can't find a match in the next 8 words
          if (!targetItem) {
            targetItem = immediateNextWordItem
          }
          
          // CRITICAL: Validate targetItem is on correct page before highlighting
          if (targetItem) {
            const elementPage = getElementPageNumber(targetItem.element)
            
            // Additional validation: reject if jumping to wrong page
            if (currentPage !== null && elementPage !== null) {
              if (!isAtPageBoundary && elementPage !== currentPage) {
                // Log the rejection for debugging
                console.warn('[TTS Boundary] Rejected cross-page jump', {
                  spokenWord: spokenWordNormalized,
                  currentPage,
                  targetPage: elementPage,
                  isAtPageBoundary,
                  startCharIndex,
                  targetCharIndex: targetItem.charIndex,
                  maxCharIndexOnCurrentPage
                })
                // Reject - don't jump to wrong page
                return
              }
              
              // If at boundary, only allow transition to immediate next page
              if (isAtPageBoundary && elementPage !== currentPage && elementPage !== currentPage + 1) {
                console.warn('[TTS Boundary] Rejected jump to non-adjacent page', {
                  spokenWord: spokenWordNormalized,
                  currentPage,
                  targetPage: elementPage
                })
                return
              }
            }
            
            const reliablePosition = targetItem.charIndex
            const isPageTransition = currentPage !== null && 
                                    elementPage !== null && 
                                    elementPage !== currentPage
            
            // Log page transitions for debugging
            if (isPageTransition) {
              console.log('[TTS Boundary] Page transition', {
                fromPage: currentPage,
                toPage: elementPage,
                spokenWord: spokenWordNormalized,
                charIndex: reliablePosition
              })
            }
            
            // Update tracking refs
            currentPlaybackPositionRef.current = reliablePosition
            lastBoundaryPositionRef.current = reliablePosition
            previousBoundaryPositionRef.current = reliablePosition
            currentReadingPageRef.current = elementPage || targetItem.page
            lastValidHighlightPositionRef.current = reliablePosition
            lastHighlightedCharIndexRef.current = reliablePosition
            lastHighlightedElementRef.current = targetItem.element
            
            // CRITICAL: Find the exact element that contains reliablePosition, not just targetItem.element
            // targetItem.element might be a span containing multiple words, so we need to find the specific word
            // Strategy: Find the word boundaries at reliablePosition, then find the span that starts at or closest to wordStart
            let exactElement = targetItem.element
            let foundExactMatch = false
            
            if (extractedText && reliablePosition >= 0 && reliablePosition < extractedText.length) {
              // Find word boundaries at reliablePosition
              let wordStart = reliablePosition
              let wordEnd = reliablePosition
              
              // Find start of word
              while (wordStart > 0 && /\S/.test(extractedText[wordStart - 1])) {
                wordStart--
              }
              
              // Find end of word
              while (wordEnd < extractedText.length && /\S/.test(extractedText[wordEnd])) {
                wordEnd++
              }
              
              // Now search for a span that starts at wordStart (or is closest to it)
              let bestSpan = null
              let bestDistance = Infinity
              
              Object.values(textLayerRefs.current).forEach(textLayer => {
                if (!textLayer || foundExactMatch) return
                const allSpans = textLayer.querySelectorAll('span[data-char-index]')
                for (const span of allSpans) {
                  const spanCharIndex = parseInt(span.dataset.charIndex, 10)
                  if (!isNaN(spanCharIndex)) {
                    // Prefer spans that start exactly at wordStart
                    if (spanCharIndex === wordStart) {
                      exactElement = span
                      foundExactMatch = true
                      break
                    }
                    // Otherwise, find the span closest to wordStart that contains wordStart
                    if (spanCharIndex <= wordStart) {
                      const spanText = span.textContent || ''
                      const spanEnd = spanCharIndex + spanText.length
                      if (wordStart < spanEnd) {
                        const distance = wordStart - spanCharIndex
                        if (distance < bestDistance) {
                          bestSpan = span
                          bestDistance = distance
                        }
                      }
                    }
                  }
                }
              })
              
              // If we found a best match but not an exact match, use it
              if (!foundExactMatch && bestSpan) {
                exactElement = bestSpan
                foundExactMatch = true
              }
            }
            
            // Directly highlight the exact element that contains reliablePosition
            // CRITICAL: Pass reliablePosition so applyReadingHighlight uses the exact word position, not the span's start
            applyReadingHighlight(exactElement, isPageTransition, reliablePosition)
          } else {
          }
        }
      }

        utterance.onstart = () => {
          utteranceStarted = true
          if (utteranceStartTimeout) {
            clearTimeout(utteranceStartTimeout)
            utteranceStartTimeout = null
          }
          
          // Initialize tracking on first segment (playing state already set above)
          if (currentSegmentIndex === 0) {
            // Playing state already set when startPlaybackFromPosition was called
            // Just update position tracking
            currentPlaybackPositionRef.current = position
            playbackStartPositionRef.current = position
            playbackStartTimeRef.current = Date.now()
            lastBoundaryPositionRef.current = position
            previousBoundaryPositionRef.current = position
            
            // Reset page tracking when starting new playback
            currentReadingPageRef.current = null
            lastValidHighlightPositionRef.current = null
            lastHighlightedCharIndexRef.current = null
            lastHighlightedElementRef.current = null
            
            // CRITICAL: Don't highlight immediately on onstart - wait for first boundary event
            // This prevents highlighting from getting ahead when clicking to start TTS
            // The boundary handler will highlight the first word when TTS actually starts speaking
            
            // Update Media Session metadata for macOS media key support
            if ('mediaSession' in navigator) {
              console.log('Setting Media Session playbackState to "playing"')
              navigator.mediaSession.playbackState = 'playing'
              navigator.mediaSession.metadata = new MediaMetadata({
                title: pdfFile ? pdfFile.name : 'SpeechCase',
                artist: 'Text-to-Speech',
                album: 'PDF Reader'
              })
              console.log('Media Session state updated. PlaybackState:', navigator.mediaSession.playbackState)
            }
          }
        }
        
        utterance.onend = () => {
          if (utteranceStartTimeout) {
            clearTimeout(utteranceStartTimeout)
            utteranceStartTimeout = null
          }
          
          // Move to next segment
          currentSegmentIndex++
          
          // If this was a header, add delay before next segment
          if (segment.isHeader) {
            setTimeout(() => {
              speakNextSegment()
            }, segment.delay)
          } else {
            // Continue immediately to next segment
            speakNextSegment()
          }
        }
      utterance.onerror = (event) => {
        if (utteranceStartTimeout) {
          clearTimeout(utteranceStartTimeout)
          utteranceStartTimeout = null
        }
        // Ignore "interrupted" errors - these are expected when pausing/cancelling speech
        if (event.error === 'interrupted') {
          setIsPlaying(false)
          isPlayingRef.current = false
          playbackInProgressRef.current = false // Clear guard
          playbackStartTimeRef.current = null
          
          // Clear the reading highlight
          clearReadingHighlight()
          
          // Update Media Session metadata
          // Keep as 'paused' instead of 'none' so macOS continues to route media keys
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused'
            console.log('Media Session playbackState set to "paused" (interrupted)')
          }
          return
        }
        
        // Only show errors for actual problems
        setError('Error during speech: ' + event.error)
        setIsPlaying(false)
        isPlayingRef.current = false
        playbackInProgressRef.current = false // Clear guard
        playbackStartTimeRef.current = null
        
        // Clear the reading highlight
        clearReadingHighlight()
        
        // Update Media Session metadata
        // Keep as 'paused' instead of 'none' so macOS continues to route media keys
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused'
          console.log('Media Session playbackState set to "paused" (error)')
        }
      }

        utteranceRef.current = utterance
        
        try {
          synthRef.current.speak(utterance)
          
          // Chrome sometimes silently rejects utterances - check if it actually started
          // Wait a bit to see if onstart fires
          utteranceStartTimeout = setTimeout(() => {
            if (!utteranceStarted && utteranceRef.current === utterance && currentSegmentIndex === 0) {
              console.warn('Utterance may have been rejected by browser (Chrome issue)')
              setError('Speech synthesis failed to start. This can happen in Chrome. Try refreshing the page or using a different browser.')
              setIsPlaying(false)
              isPlayingRef.current = false
              playbackInProgressRef.current = false // Clear guard
              utteranceRef.current = null
              clearReadingHighlight()
            }
          }, 500)
        } catch (error) {
          console.error('Error calling speech synthesis speak():', error)
          setError('Error starting speech: ' + error.message)
          utteranceRef.current = null
          setIsPlaying(false)
          isPlayingRef.current = false
          playbackInProgressRef.current = false // Clear guard
          return false
        }
      }
      
      // Start speaking the first segment
      speakNextSegment()
      return true
  }

  const handlePlay = () => {
    if (!extractedText) {
      setError('No text to read. Please upload a PDF first.')
      return
    }

    // If already playing, pause instead
    if (isPlaying) {
      // Save current playback position before canceling
      const currentPos = lastBoundaryPositionRef.current !== undefined 
        ? lastBoundaryPositionRef.current 
        : currentPlaybackPositionRef.current
      if (currentPos !== undefined) {
        setStartPosition(currentPos)
        startPositionRef.current = currentPos
      }
      
      // Handle Google TTS audio
      if (audioRef.current) {
        isCancelledRef.current = true
        audioRef.current.pause()
        audioRef.current = null
      }
      
      // Handle browser TTS
      if (synthRef.current) {
        // Cancel all pending utterances
        synthRef.current.cancel()
        // Also clear the utterance ref to prevent any pending callbacks
        if (utteranceRef.current) {
          utteranceRef.current = null
        }
      }
      
      setIsPlaying(false)
      isPlayingRef.current = false
      playbackInProgressRef.current = false // Clear playback guard
      clearReadingHighlight()
      
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused'
      }
      return
    }

    // Determine language to check if we need synthRef
    let langToUse = language
    if (language === 'auto') {
      langToUse = detectedLanguage || detectLanguage(extractedText) || 'en'
    }

    // Only check synthRef for English (Google TTS doesn't need it)
    if (langToUse !== 'es' && !synthRef.current) {
      setError('Text-to-speech is not available in your browser.')
      return
    }

    // Start playback from current start position (which may have been updated when paused)
    // Use ref value (updated when pausing) and sync state
    const positionToUse = startPositionRef.current
    if (positionToUse !== startPosition) {
      setStartPosition(positionToUse)
    }
    // Handle async call properly
    startPlaybackFromPosition(positionToUse).then(success => {
      if (!success) {
        setError('No text to read from the selected position. Please click on a word in the PDF to set the start position.')
      }
    }).catch(error => {
      console.error('Error starting playback:', error)
      setError('Error starting playback: ' + error.message)
    })
  }

  const handleStop = () => {
        // Handle Google TTS audio
        if (audioRef.current) {
          isCancelledRef.current = true
          audioRef.current.pause()
          audioRef.current = null
        }
        
        // Handle browser TTS
        if (synthRef.current) {
          synthRef.current.cancel()
          utteranceRef.current = null
        }
        
        setIsPlaying(false)
        isPlayingRef.current = false
        playbackStartTimeRef.current = null
        // Keep currentPlaybackPositionRef at current value (don't reset)
        
        // Clear the reading highlight (this will reset page tracking since isPlayingRef is false)
        clearReadingHighlight()
        
        // Update Media Session metadata
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'none'
        }
      }

  const handleResetStartPosition = () => {
    clearStartMarker()
    setStartPosition(0)
    currentPlaybackPositionRef.current = 0
    playbackStartPositionRef.current = 0
    lastBoundaryPositionRef.current = 0
    playbackStartTimeRef.current = null
  }

  // Calculate skip amount: approximately 10 seconds of speech
  // At normal speech rate (150-200 words/min), 10 seconds ≈ 25-33 words ≈ 150 characters
  const SKIP_CHARACTERS = 150

  const handleRewind = () => {
    if (!extractedText) return
    
    // Use current playback position (from ref) if playing, otherwise use startPosition
    const currentPos = isPlaying ? currentPlaybackPositionRef.current : startPosition
    
    // Calculate new position (skip backwards)
    const newPosition = Math.max(0, currentPos - SKIP_CHARACTERS)
    
    // Try to find a word boundary for more natural positioning
    const wordStart = findWordStart(extractedText, newPosition)
    
    // Update the position state
    setStartPosition(wordStart)
    
    // If currently playing, immediately restart from new position
    if (isPlaying) {
      // Store the new position before cancellation
      const newPos = wordStart
      
      // Handle Google TTS audio
      if (audioRef.current) {
        isCancelledRef.current = true
        audioRef.current.pause()
        audioRef.current = null
      }
      
      // Handle browser TTS
      if (synthRef.current) {
        // Cancel all speech (clear the queue) - do this multiple times to ensure it works
        synthRef.current.cancel()
        if (utteranceRef.current) {
          utteranceRef.current = null
        }
      }
      
      // Reset playing state
      setIsPlaying(false)
      clearReadingHighlight()
      
      // Force stop any remaining speech and restart
      const restartPlayback = () => {
        // Ensure speech is fully stopped (for browser TTS)
        if (synthRef.current && synthRef.current.speaking) {
          synthRef.current.cancel()
          setTimeout(restartPlayback, 50)
          return
        }
        // Now start from the new position
        startPlaybackFromPosition(newPos)
      }
      
      // Start the restart process after a short delay
      setTimeout(restartPlayback, 100)
    }
  }

  const handleForward = () => {
    if (!extractedText) return
    
    // Use current playback position (from ref) if playing, otherwise use startPosition
    const currentPos = isPlaying ? currentPlaybackPositionRef.current : startPosition
    
    // Calculate new position (skip forwards)
    const newPosition = Math.min(extractedText.length, currentPos + SKIP_CHARACTERS)
    
    // If we're already at or near the end, don't do anything
    if (newPosition <= currentPos) return
    
    // Try to find a word boundary for more natural positioning
    const wordStart = findWordStart(extractedText, newPosition)
    
    // Update the position state
    setStartPosition(wordStart)
    
    // If currently playing, immediately restart from new position
    if (isPlaying) {
      // Store the new position before cancellation
      const newPos = wordStart
      
      // Handle Google TTS audio
      if (audioRef.current) {
        isCancelledRef.current = true
        audioRef.current.pause()
        audioRef.current = null
      }
      
      // Handle browser TTS
      if (synthRef.current) {
        // Cancel all speech (clear the queue) - do this multiple times to ensure it works
        synthRef.current.cancel()
        if (utteranceRef.current) {
          utteranceRef.current = null
        }
      }
      
      // Reset playing state
      setIsPlaying(false)
      clearReadingHighlight()
      
      // Force stop any remaining speech and restart
      const restartPlayback = () => {
        // Ensure speech is fully stopped (for browser TTS)
        if (synthRef.current && synthRef.current.speaking) {
          synthRef.current.cancel()
          setTimeout(restartPlayback, 50)
          return
        }
        // Now start from the new position
        startPlaybackFromPosition(newPos)
      }
      
      // Start the restart process after a short delay
      setTimeout(restartPlayback, 100)
    }
  }

  // Jump to the current reading position and re-enable auto-scroll
  const jumpToCurrentReading = () => {
    if (currentReadingElementRef.current) {
      isProgrammaticScrollRef.current = true
      lastProgrammaticScrollTimeRef.current = Date.now()
      currentReadingElementRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Reset flag after scroll animation completes (smooth scroll can take up to 1000ms)
      setTimeout(() => {
        isProgrammaticScrollRef.current = false
      }, 1100)
      // Re-enable auto-scroll when user manually jumps to current position
      if (!autoScrollEnabledRef.current) {
        autoScrollEnabledRef.current = true
        setAutoScrollEnabled(true)
      }
    }
  }

  const scrollToPage = (pageNum) => {
    const pageElement = document.getElementById(`page-${pageNum}`)
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setCurrentPage(pageNum)
    }
  }

  // Zoom handlers that preserve scroll position
  const handleZoomIn = () => {
    // Save current scroll position before zooming
    const scrollPos = getCurrentScrollPosition()
    if (scrollPos) {
      scrollPositionBeforeZoomRef.current = scrollPos
    }
    setPageScale(Math.min(3.0, pageScale + 0.25))
  }

  const handleZoomOut = () => {
    // Save current scroll position before zooming
    const scrollPos = getCurrentScrollPosition()
    if (scrollPos) {
      scrollPositionBeforeZoomRef.current = scrollPos
    }
    setPageScale(Math.max(0.5, pageScale - 0.25))
  }

  // Restore scroll position after pages are re-rendered
  const restoreScrollPosition = () => {
    const scrollPos = scrollPositionBeforeZoomRef.current
    if (!scrollPos) return

    const pdfViewer = document.querySelector('.pdf-viewer-container')
    if (!pdfViewer) return

    const pageElement = document.getElementById(`page-${scrollPos.pageNum}`)
    if (!pageElement) {
      // Page element doesn't exist yet, try again later
      return
    }

    // Get page dimensions - use getBoundingClientRect for accurate measurements
    const pageRect = pageElement.getBoundingClientRect()
    const containerRect = pdfViewer.getBoundingClientRect()
    
    // Calculate page position relative to container
    const pageTop = pageRect.top - containerRect.top + pdfViewer.scrollTop
    const pageHeight = pageRect.height

    // If page height is 0 or invalid, it's not laid out yet - skip for now
    if (pageHeight <= 0) {
      return
    }

    // Calculate target scroll position based on relative position
    // Center the target position in the viewport
    const targetScrollTop = pageTop + (scrollPos.relativePosition * pageHeight) - (pdfViewer.clientHeight / 2)

    // Set scroll position immediately (no smooth scrolling to avoid visible animation)
    pdfViewer.scrollTop = targetScrollTop

    // Update page counter after restoring scroll position
    // Use a small delay to ensure DOM has updated and scroll position is applied
    setTimeout(() => {
      const currentScrollPos = getCurrentScrollPosition()
      if (currentScrollPos && currentScrollPos.pageNum !== null) {
        setCurrentPage(currentScrollPos.pageNum)
      }
    }, 10)

    // Only clear the saved position if we successfully scrolled
    // This allows the fine-tuning effect to run if needed
    if (Math.abs(pdfViewer.scrollTop - targetScrollTop) < 10) {
      scrollPositionBeforeZoomRef.current = null
    }
  }

  // Restore scroll position after returning from full view components
  const restoreScrollPositionFromFullView = () => {
    const scrollPos = scrollPositionBeforeFullViewRef.current
    if (!scrollPos) return

    const pdfViewer = document.querySelector('.pdf-viewer-container')
    if (!pdfViewer) return

    // If we have the exact scrollTop saved, use it directly (most accurate)
    if (scrollPos.exactScrollTop !== undefined && scrollPos.exactScrollTop !== null) {
      // Set scroll position immediately (no smooth scrolling)
      pdfViewer.scrollTop = scrollPos.exactScrollTop
      
      // Update page counter after restoring scroll position
      // Use multiple retries with increasing delays to handle cases where DOM isn't ready
      const attemptRestore = (attempt = 1, maxAttempts = 5) => {
        const delay = attempt * 50 // 50ms, 100ms, 150ms, etc. (2x faster)
        setTimeout(() => {
          // Verify scroll position is still correct (might have been reset)
          if (Math.abs(pdfViewer.scrollTop - scrollPos.exactScrollTop) > 10) {
            // Scroll position was reset, try again
            pdfViewer.scrollTop = scrollPos.exactScrollTop
            
            // If not the last attempt, try again
            if (attempt < maxAttempts) {
              attemptRestore(attempt + 1, maxAttempts)
              return
            }
          }
          
          // Verify restoration was successful
          const scrollRestored = Math.abs(pdfViewer.scrollTop - scrollPos.exactScrollTop) <= 10
          
          const currentScrollPos = getCurrentScrollPosition()
          
          // Update page counter - prefer getCurrentScrollPosition, but fallback to saved page number
          if (currentScrollPos && currentScrollPos.pageNum !== null && scrollRestored) {
            // Only use getCurrentScrollPosition if restoration was successful
            setCurrentPage(currentScrollPos.pageNum)
          } else {
            // Fallback: use saved page number (more reliable when scroll restoration is in progress)
            setCurrentPage(scrollPos.pageNum)
          }
          
          // Only clear saved position if restoration was successful
          if (scrollRestored) {
            scrollPositionBeforeFullViewRef.current = null
            
            // Ensure scroll listener remains active by triggering multiple scroll events
            // This ensures the page counter listener picks up the change and continues to work
            // Use requestAnimationFrame to ensure DOM is ready
            requestAnimationFrame(() => {
              // Trigger scroll event to wake up the listener
              const scrollEvent = new Event('scroll', { bubbles: true })
              pdfViewer.dispatchEvent(scrollEvent)
              
              // Also manually trigger an update after a short delay to ensure listener is working
              setTimeout(() => {
                const scrollPos = getCurrentScrollPosition()
                if (scrollPos && scrollPos.pageNum !== null) {
                  setCurrentPage(scrollPos.pageNum)
                }
                // Trigger another scroll event to ensure listener is responsive
                pdfViewer.dispatchEvent(scrollEvent)
              }, 100)
            })
          } else if (attempt < maxAttempts) {
            // Try again if we haven't reached max attempts
            attemptRestore(attempt + 1, maxAttempts)
          }
        }, delay)
      }
      
      // Start restoration attempts
      attemptRestore()
      
      return
    }

    // Fallback: calculate from page and relative position
    const pageElement = document.getElementById(`page-${scrollPos.pageNum}`)
    if (!pageElement) {
      // Page element doesn't exist yet, try again later
      setTimeout(() => {
        restoreScrollPositionFromFullView()
      }, 25)
      return
    }

    // Get page dimensions - use getBoundingClientRect for accurate measurements
    const pageRect = pageElement.getBoundingClientRect()
    const containerRect = pdfViewer.getBoundingClientRect()
    
    // Calculate page position relative to container
    const pageTop = pageRect.top - containerRect.top + pdfViewer.scrollTop
    const pageHeight = pageRect.height

    // If page height is 0 or invalid, it's not laid out yet - skip for now
    if (pageHeight <= 0) {
      // Retry after a short delay
      setTimeout(() => {
        restoreScrollPositionFromFullView()
      }, 50)
      return
    }

    // Calculate target scroll position based on relative position
    // Use the exact relative position to restore to the same view
    const targetScrollTop = pageTop + (scrollPos.relativePosition * pageHeight) - (pdfViewer.clientHeight / 2)

    // Set scroll position immediately (no smooth scrolling to avoid visible animation)
    pdfViewer.scrollTop = targetScrollTop

    // Update page counter after restoring scroll position
    // Reduced delay for faster restoration (2x faster)
    setTimeout(() => {
      // Verify scroll position is still correct (might have been reset)
      if (Math.abs(pdfViewer.scrollTop - targetScrollTop) > 10) {
        // Scroll position was reset, try again
        pdfViewer.scrollTop = targetScrollTop
      }
      
      // Verify restoration was successful before clearing saved position
      const scrollRestored = Math.abs(pdfViewer.scrollTop - targetScrollTop) <= 10
      
      const currentScrollPos = getCurrentScrollPosition()
      if (currentScrollPos && currentScrollPos.pageNum !== null) {
        setCurrentPage(currentScrollPos.pageNum)
      } else {
        // Fallback: use saved page number if getCurrentScrollPosition fails
        setCurrentPage(scrollPos.pageNum)
      }
      
      // Only clear saved position if restoration was successful
      if (scrollRestored) {
        scrollPositionBeforeFullViewRef.current = null
        
        // Ensure scroll listener remains active by triggering multiple scroll events
        // This ensures the page counter listener picks up the change and continues to work
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          // Trigger scroll event to wake up the listener
          const scrollEvent = new Event('scroll', { bubbles: true })
          pdfViewer.dispatchEvent(scrollEvent)
          
          // Also manually trigger an update after a short delay to ensure listener is working
          setTimeout(() => {
            const scrollPos = getCurrentScrollPosition()
            if (scrollPos && scrollPos.pageNum !== null) {
              setCurrentPage(scrollPos.pageNum)
            }
            // Trigger another scroll event to ensure listener is responsive
            pdfViewer.dispatchEvent(scrollEvent)
          }, 100)
        })
      }
    }, 50)
  }

  const handleReset = () => {
    handleStop()
    clearStartMarker()
    setPdfFile(null)
    setPdfDoc(null)
    setExtractedText('')
    setTextItems([])
    setCurrentPage(1)
    setTotalPages(0)
    setError('')
    setDetectedLanguage(null)
    // Navigate back to dashboard
    navigate('/dashboard')
    setStartPosition(0)
    setRenderedPages([])
    setPageData([])
    setHighlights([])
    setHighlightHistory([[]])
    setHistoryIndex(0)
    historyIndexRef.current = 0
    highlightHistoryRef.current = [[]]
    highlightsRef.current = []
    setInteractionMode('read')
    canvasRefs.current = {}
    textLayerRefs.current = {}
    highlightLayerRefs.current = {}
    selectionLayerRefs.current = {}
    pdfArrayBufferRef.current = null
    currentPlaybackPositionRef.current = 0
    playbackStartPositionRef.current = 0
    lastBoundaryPositionRef.current = 0
    playbackStartTimeRef.current = null
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Helper function to measure text width using canvas
  const measureTextWidth = (text, fontFamily, fontSize) => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    context.font = `${fontSize}px ${fontFamily}`
    return context.measureText(text).width
  }

  // Helper function to detect column boundaries from span positions
  // Returns an array of boundaries sorted from left to right
  const detectColumnBoundaries = (textLayerDiv) => {
    if (!textLayerDiv) return []
    
    const textLayerRect = textLayerDiv.getBoundingClientRect()
    const allSpans = Array.from(textLayerDiv.querySelectorAll('span'))
    
    if (allSpans.length === 0) return []
    
    // Collect X positions of all spans with their widths and font sizes
    const spanData = []
    const fontSizes = []
    
    allSpans.forEach(span => {
      const spanRect = span.getBoundingClientRect()
      const spanX = spanRect.left - textLayerRect.left
      const spanRight = spanX + spanRect.width
      
      // Get font size
      let fontSize = parseFloat(span.style.fontSize)
      if (isNaN(fontSize) || span.style.fontSize === '') {
        const computedStyle = window.getComputedStyle(span)
        fontSize = parseFloat(computedStyle.fontSize)
      }
      if (isNaN(fontSize)) {
        fontSize = spanRect.height || 12
      }
      
      // Only consider spans with actual text content and reasonable width
      if (span.textContent && span.textContent.trim().length > 0 && spanRect.width > 5) {
        spanData.push({ left: spanX, right: spanRight, width: spanRect.width })
        fontSizes.push(fontSize)
      }
    })
    
    if (spanData.length === 0) return []
    
    // Calculate average font size for dynamic gap threshold
    const avgFontSize = fontSizes.length > 0 
      ? fontSizes.reduce((a, b) => a + b, 0) / fontSizes.length 
      : 12
    // Use 2.5x font size as minimum gap threshold (proportional to text size)
    const minGap = avgFontSize * 2.5
    
    // Sort by left position
    spanData.sort((a, b) => a.left - b.left)
    
    const minX = spanData[0].left
    const maxX = spanData[spanData.length - 1].right
    const contentWidth = maxX - minX
    const middleStart = minX + contentWidth * 0.15
    const middleEnd = minX + contentWidth * 0.85
    
    // Find all significant gaps that could be column boundaries
    const gaps = []
    for (let i = 1; i < spanData.length; i++) {
      const gap = spanData[i].left - spanData[i - 1].right
      const gapCenter = (spanData[i].left + spanData[i - 1].right) / 2
      
      // Check if gap is significant and in the middle region
      if (gap > minGap && gapCenter >= middleStart && gapCenter <= middleEnd) {
        gaps.push({ gap, center: gapCenter, left: spanData[i - 1].right, right: spanData[i].left })
      }
    }
    
    // Sort gaps by size (largest first)
    gaps.sort((a, b) => b.gap - a.gap)
    
    // If we have gaps, use them as boundaries
    if (gaps.length > 0) {
      // Take the largest gaps (up to 4 boundaries for 5 columns max)
      const boundaries = gaps.slice(0, 4).map(g => g.center).sort((a, b) => a - b)
      
      return boundaries
    }
    
    // Fallback: Use clustering approach to find multiple column boundaries
    const xPositions = spanData.map(s => s.left)
    const sortedX = [...xPositions].sort((a, b) => a - b)
    
    // Try to find 2-4 column boundaries using variance minimization
    let bestBoundaries = null
    let minTotalVariance = Infinity
    
    // Try different numbers of columns (2-5)
    for (let numColumns = 2; numColumns <= 5; numColumns++) {
      const boundaries = []
      const clusterSize = Math.floor(sortedX.length / numColumns)
      
      for (let col = 1; col < numColumns; col++) {
        const splitIdx = col * clusterSize
        if (splitIdx > 0 && splitIdx < sortedX.length) {
          boundaries.push((sortedX[splitIdx - 1] + sortedX[splitIdx]) / 2)
        }
      }
      
      if (boundaries.length === 0) continue
      
      // Calculate total variance for this configuration
      let totalVariance = 0
      let prevBoundary = 0
      for (let i = 0; i <= boundaries.length; i++) {
        const startIdx = i === 0 ? 0 : sortedX.findIndex(x => x >= boundaries[i - 1])
        const endIdx = i === boundaries.length ? sortedX.length : sortedX.findIndex(x => x >= boundaries[i])
        
        if (startIdx >= 0 && endIdx > startIdx) {
          const cluster = sortedX.slice(startIdx, endIdx)
          if (cluster.length > 0) {
            const mean = cluster.reduce((a, b) => a + b, 0) / cluster.length
            const variance = cluster.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / cluster.length
            totalVariance += variance
          }
        }
      }
      
      if (totalVariance < minTotalVariance) {
        minTotalVariance = totalVariance
        bestBoundaries = boundaries.sort((a, b) => a - b)
      }
    }
    
    if (bestBoundaries && bestBoundaries.length > 0) {
      return bestBoundaries
    }
    
    // Final fallback: single midpoint
    const fallbackBoundary = (minX + maxX) / 2
    return [fallbackBoundary]
  }

  // Helper function to extract column index from a selection range
  const getColumnIndexFromRange = (range, textLayerDiv = null, rectangles = null) => {
    if (!range) {
      return null
    }
    
    try {
      // Find the span that contains the start of the selection
      const startContainer = range.startContainer
      let span = null
      
      if (startContainer.nodeType === Node.TEXT_NODE) {
        span = startContainer.parentElement
      } else if (startContainer.nodeType === Node.ELEMENT_NODE) {
        span = startContainer
      }
      
      // Look for column index in the span or its parent line container
      if (span) {
        // Check if span has column index
        const spanColIdx = span.dataset.columnIndex
        if (spanColIdx !== undefined) {
          return parseInt(spanColIdx)
        }
        
        // Fallback: check parent line container
        const lineContainer = span.closest('span[data-column-index]')
        if (lineContainer && lineContainer.dataset.columnIndex !== undefined) {
          return parseInt(lineContainer.dataset.columnIndex)
        }
      }
      
      // Fallback: Calculate column index from X position of rectangles
      // This is needed when spans don't have data-column-index attribute set
      if (rectangles && rectangles.length > 0 && textLayerDiv) {
        const textLayerRect = textLayerDiv.getBoundingClientRect()
        const firstRectX = rectangles[0].x
        
        // Detect column boundaries from actual span positions (returns array)
        const columnBoundaries = detectColumnBoundaries(textLayerDiv)
        
        let result
        if (columnBoundaries.length > 0) {
          // Find which column the X position falls into
          // Boundaries are sorted left to right, so find the first boundary that's greater than X
          let columnIndex = 0
          for (let i = 0; i < columnBoundaries.length; i++) {
            if (firstRectX < columnBoundaries[i]) {
              break
            }
            columnIndex = i + 1
          }
          result = columnIndex
        } else {
          // Fallback to midpoint if detection fails
          const textLayerWidth = textLayerRect.width
          const midPoint = textLayerWidth / 2
          result = firstRectX < midPoint ? 0 : 1
        }
        
        return result
      }
    } catch (e) {
      console.warn('Failed to extract column index from range:', e)
    }
    
    return null
  }

  // Helper function to calculate precise rectangles from a Range
  // Returns an array of rectangles (one per line segment) instead of a single bounding box
  const calculatePreciseRectangles = (range, textLayerDiv) => {
    const textLayerRect = textLayerDiv.getBoundingClientRect()
    const rects = []
    
    // Clone the range to avoid modifying the original
    const clonedRange = range.cloneRange()
    
    // Get all spans in the text layer
    const allSpans = Array.from(textLayerDiv.querySelectorAll('span'))
    
    // First, collect all selected spans with their selection info
    const selectedSpans = []
    
    allSpans.forEach(span => {
      const textNode = span.firstChild
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return
      
      // Create a range for this span
      const spanRange = document.createRange()
      spanRange.selectNodeContents(span)
      
      // Check if selection intersects with this span
      const startToEnd = clonedRange.compareBoundaryPoints(Range.START_TO_END, spanRange)
      const endToStart = clonedRange.compareBoundaryPoints(Range.END_TO_START, spanRange)
      
      if (startToEnd < 0 || endToStart > 0) {
        // No intersection
        return
      }
      
      // Determine the selected portion of this span
      let startOffset = 0
      let endOffset = textNode.textContent.length
      
      // Check if selection starts in this span's text node
      if (clonedRange.startContainer === textNode) {
        startOffset = clonedRange.startOffset
      } else if (span.contains(clonedRange.startContainer)) {
        // Selection starts within this span (could be the span itself or a child)
        if (clonedRange.startContainer.nodeType === Node.TEXT_NODE) {
          startOffset = clonedRange.startOffset
        } else {
          // Start container is the span element, so check position
          const startToStart = clonedRange.compareBoundaryPoints(Range.START_TO_START, spanRange)
          if (startToStart <= 0) {
            startOffset = 0
          }
        }
      } else {
        // Selection starts before this span - check if span is fully selected
        const startToStart = clonedRange.compareBoundaryPoints(Range.START_TO_START, spanRange)
        if (startToStart < 0) {
          // Selection starts before this span, so entire span is selected
          startOffset = 0
        }
      }
      
      // Check if selection ends in this span's text node
      if (clonedRange.endContainer === textNode) {
        endOffset = clonedRange.endOffset
      } else if (span.contains(clonedRange.endContainer)) {
        // Selection ends within this span
        if (clonedRange.endContainer.nodeType === Node.TEXT_NODE) {
          endOffset = clonedRange.endOffset
        } else {
          // End container is the span element
          const endToEnd = clonedRange.compareBoundaryPoints(Range.END_TO_END, spanRange)
          if (endToEnd >= 0) {
            endOffset = textNode.textContent.length
          }
        }
      } else {
        // Selection ends after this span - check if span is fully selected
        const endToEnd = clonedRange.compareBoundaryPoints(Range.END_TO_END, spanRange)
        if (endToEnd > 0) {
          // Selection ends after this span, so entire span is selected
          endOffset = textNode.textContent.length
        }
      }
      
      // Only add if there's actually a selected portion
      if (startOffset < endOffset && startOffset >= 0 && endOffset <= textNode.textContent.length) {
        // Always use getBoundingClientRect for accurate positioning regardless of text visibility
        // This ensures coordinates are correct even when text color changes
        const spanRect = span.getBoundingClientRect()
        const spanLeft = spanRect.left - textLayerRect.left
        const spanTop = spanRect.top - textLayerRect.top
        
        // Get font size - try inline style first, then computed style, then bounding rect height
        let spanHeight = parseFloat(span.style.fontSize)
        
        // Get height from bounding rect if fontSize is not available
        if (isNaN(spanHeight) || span.style.fontSize === '') {
          spanHeight = spanRect.height
        }
        
        // If fontSize is still not available, use computed style
        if (isNaN(spanHeight) || span.style.fontSize === '') {
          const computedStyle = window.getComputedStyle(span)
          spanHeight = parseFloat(computedStyle.fontSize)
          // If computed style also fails, use bounding rect height if available
          if (isNaN(spanHeight)) {
            if (!spanRect) {
              spanRect = span.getBoundingClientRect()
            }
            spanHeight = spanRect ? spanRect.height : 12
          }
        }
        
        // Get column index from span's data attribute (or from parent line container)
        let columnIndex = span.dataset.columnIndex
        if (!columnIndex) {
          // Fallback: try to get from parent line container
          const lineContainer = span.closest('span[data-column-index]')
          if (lineContainer) {
            columnIndex = lineContainer.dataset.columnIndex
          }
        }
        
        selectedSpans.push({
          span,
          textNode,
          startOffset,
          endOffset,
          spanLeft,
          spanTop,
          fontSize: spanHeight,
          fontFamily: span.style.fontFamily || 'sans-serif',
          transform: span.style.transform,
          columnIndex: columnIndex !== undefined ? parseInt(columnIndex) : null
        })
      }
    })
    
    // Filter spans to only include those in the same column as the selection start
    // This prevents highlighting across columns in multi-column layouts
    if (selectedSpans.length > 0) {
      // Find the column index of the span where the selection starts
      // Check which span contains the startContainer of the selection range
      let startColumnIndex = null
      
      // First, try to find the span that directly contains the start container
      for (const spanInfo of selectedSpans) {
        if (spanInfo.span.contains(clonedRange.startContainer) || 
            spanInfo.textNode === clonedRange.startContainer) {
          if (spanInfo.columnIndex !== null) {
            startColumnIndex = spanInfo.columnIndex
            break
          }
        }
      }
      
      // If not found, use the first span's column index as fallback
      if (startColumnIndex === null && selectedSpans.length > 0) {
        startColumnIndex = selectedSpans[0].columnIndex
      }
      
      // If we have a valid column index, filter to only include spans in that column
      // Also include spans with null columnIndex to avoid losing spans that don't have the attribute set
      if (startColumnIndex !== null) {
        const filteredSpans = selectedSpans.filter(spanInfo => 
          spanInfo.columnIndex === startColumnIndex || spanInfo.columnIndex === null
        )
        
        // Only use filtered spans if we have at least one (to avoid losing all selection)
        if (filteredSpans.length > 0) {
          selectedSpans.length = 0
          selectedSpans.push(...filteredSpans)
        }
      }
    }
    
    if (selectedSpans.length === 0) {
      // Fallback to getClientRects if no spans were processed
      const clientRects = range.getClientRects()
      for (let i = 0; i < clientRects.length; i++) {
        const rect = clientRects[i]
        if (rect.width > 0 && rect.height > 0) {
          rects.push({
            x: rect.left - textLayerRect.left,
            y: rect.top - textLayerRect.top,
            width: rect.width,
            height: rect.height
          })
        }
      }
      return rects.length > 0 ? rects : null
    }
    
    // Helper function to combine spans on the same line into a single rectangle
    function combineSpansOnLine(spanGroup) {
      if (spanGroup.length === 0) return null
      
      // Sort by left position
      spanGroup.sort((a, b) => a.spanLeft - b.spanLeft)
      
      const firstSpan = spanGroup[0]
      const lastSpan = spanGroup[spanGroup.length - 1]
      
      // Check if any span has rotation
      const hasRotation = spanGroup.some(s => {
        const transform = s.transform
        if (!transform || transform === 'none') return false
        const match = transform.match(/rotate\(([^)]+)\)/)
        if (match) {
          const angleStr = match[1]
          let angle = 0
          if (angleStr.includes('rad')) {
            angle = parseFloat(angleStr)
          } else if (angleStr.includes('deg')) {
            angle = parseFloat(angleStr) * Math.PI / 180
          }
          return Math.abs(angle) >= 0.001
        }
        return false
      })
      
      if (hasRotation) {
        // For rotated text, process each span individually
        const individualRects = []
        spanGroup.forEach(spanInfo => {
          const fullTextWidth = measureTextWidth(spanInfo.textNode.textContent, spanInfo.fontFamily, spanInfo.fontSize)
          individualRects.push({
            x: spanInfo.spanLeft,
            y: spanInfo.spanTop,
            width: fullTextWidth,
            height: spanInfo.fontSize
          })
        })
        // Return the first one (we'll handle multiple rectangles separately if needed)
        return individualRects[0]
      }
      
      // For non-rotated text, combine all spans into one rectangle
      // Use actual DOM bounding rectangles to ensure continuous coverage without gaps
      
      // Get actual DOM positions for all spans
      const firstSpanRect = firstSpan.span.getBoundingClientRect()
      const lastSpanRect = lastSpan.span.getBoundingClientRect()
      
      // Calculate the start position of the first span's selected portion using actual DOM
      // Use Range API to get precise positions instead of text measurement which can be inaccurate
      let firstStartX
      if (firstSpan.startOffset === 0) {
        // Selection starts at the beginning of the span, use actual left position
        firstStartX = firstSpanRect.left - textLayerRect.left
      } else {
        // Selection starts within the span - use Range API to get exact position
        const startRange = document.createRange()
        startRange.setStart(firstSpan.textNode, 0)
        startRange.setEnd(firstSpan.textNode, firstSpan.startOffset)
        const startRangeRect = startRange.getBoundingClientRect()
        firstStartX = startRangeRect.right - textLayerRect.left
      }
      
      // Calculate the end position of the last span's selected portion using actual DOM
      // Use Range API to get precise positions instead of text measurement which can be inaccurate
      // endOffset is the position AFTER the last selected character
      let lastEndX
      const lastSpanTextLength = lastSpan.textNode.textContent.length
      if (lastSpan.endOffset === lastSpanTextLength) {
        // Selection ends at the end of the span, use actual right position
        lastEndX = lastSpanRect.right - textLayerRect.left
      } else if (lastSpan.endOffset === 0) {
        // Selection ends at the start of the span (shouldn't happen, but handle it)
        lastEndX = lastSpanRect.left - textLayerRect.left
      } else {
        // Selection ends within the span - use Range API to get exact position at endOffset
        const endRange = document.createRange()
        endRange.setStart(lastSpan.textNode, 0)
        endRange.setEnd(lastSpan.textNode, lastSpan.endOffset)
        const endRangeRect = endRange.getBoundingClientRect()
        lastEndX = endRangeRect.right - textLayerRect.left
      }
      
      // For multiple spans, we need to bridge gaps between them
      // But for single span, just use the calculated selected portion
      let minStartX = firstStartX
      let maxEndX = lastEndX
      
      if (spanGroup.length > 1) {
        // Multiple spans - ensure we bridge gaps between them
        spanGroup.forEach((spanInfo, index) => {
          // Calculate the selected portion of this span
          const selectedText = spanInfo.textNode.textContent.substring(spanInfo.startOffset, spanInfo.endOffset)
          const textBefore = spanInfo.textNode.textContent.substring(0, spanInfo.startOffset)
          const textBeforeWidth = measureTextWidth(textBefore, spanInfo.fontFamily, spanInfo.fontSize)
          const selectedWidth = measureTextWidth(selectedText, spanInfo.fontFamily, spanInfo.fontSize)
          
          // Calculate the start and end of the selected portion
          const spanStartX = spanInfo.spanLeft + textBeforeWidth
          const spanEndX = spanStartX + selectedWidth
          
          // For the first span, we already have firstStartX
          // For the last span, we already have lastEndX
          // For spans in between, extend to bridge gaps
          if (index > 0 && index < spanGroup.length - 1) {
            // Middle spans - extend to cover their selected portion and bridge gaps
            if (spanStartX < minStartX) {
              minStartX = spanStartX
            }
            if (spanEndX > maxEndX) {
              maxEndX = spanEndX
            }
          }
        })
        
        // For multiple spans, also check if we need to bridge gaps between first and last
        // by looking at the actual DOM positions of spans in between
        for (let i = 1; i < spanGroup.length - 1; i++) {
          const prevSpan = spanGroup[i - 1]
          const currSpan = spanGroup[i]
          
          // Get actual DOM positions to bridge gaps
          const prevSpanRect = prevSpan.span.getBoundingClientRect()
          const currSpanRect = currSpan.span.getBoundingClientRect()
          const prevSpanRight = prevSpanRect.right - textLayerRect.left
          const currSpanLeft = currSpanRect.left - textLayerRect.left
          
          // If there's a gap, ensure our rectangle covers it
          if (currSpanLeft > prevSpanRight) {
            // There's a gap - the rectangle merging logic will handle this
            // But we should ensure minStartX and maxEndX account for the full range
          }
        }
      }
      // For single span, minStartX and maxEndX are already set correctly above
      
      // The total width is from the start of the first selection to the end of the last
      // This ensures continuous coverage including any spaces between spans
      const totalWidth = maxEndX - minStartX
      
      // Use the maximum fontSize from the group
      const maxFontSize = Math.max(...spanGroup.map(s => s.fontSize))
      
      const result = {
        x: minStartX,
        y: firstSpan.spanTop,
        width: totalWidth,
        height: maxFontSize
      }
      
      return result
    }
    
    // Sort selected spans by their position (top, then column, then left)
    selectedSpans.sort((a, b) => {
      const topDiff = a.spanTop - b.spanTop
      if (Math.abs(topDiff) > 1) { // Allow small tolerance for same line
        return topDiff
      }
      // If on same line (same Y), sort by column index first, then by left position
      if (a.columnIndex !== null && b.columnIndex !== null) {
        const colDiff = a.columnIndex - b.columnIndex
        if (colDiff !== 0) return colDiff
      }
      return a.spanLeft - b.spanLeft
    })
    
    // Group consecutive spans on the same line AND same column, then combine them
    let currentGroup = []
    let currentTop = null
    let currentColumn = null
    const tolerance = 1 // Tolerance for considering spans on the same line
    
    selectedSpans.forEach((spanInfo, index) => {
      const isNewLine = currentTop === null || Math.abs(spanInfo.spanTop - currentTop) > tolerance
      const isNewColumn = currentColumn === null || spanInfo.columnIndex !== currentColumn
      
      // Start a new group if it's a new line OR a new column (even on the same line)
      if (isNewLine || isNewColumn) {
        // Process previous group if it exists
        if (currentGroup.length > 0) {
          const combinedRect = combineSpansOnLine(currentGroup)
          if (combinedRect) {
            rects.push(combinedRect)
          }
        }
        // Start new group
        currentGroup = [spanInfo]
        currentTop = spanInfo.spanTop
        currentColumn = spanInfo.columnIndex
      } else {
        // Same line and same column - add to current group
        currentGroup.push(spanInfo)
      }
    })
    
    // Don't forget the last group
    if (currentGroup.length > 0) {
      const combinedRect = combineSpansOnLine(currentGroup)
      if (combinedRect) {
        rects.push(combinedRect)
      }
    }
    
    // Merge rectangles on the same line that are close together or overlapping
    // This ensures continuous highlighting without gaps
    if (rects.length > 1) {
      const mergedRects = []
      const lineTolerance = 2 // Pixels tolerance for same line
      const gapTolerance = 5 // Pixels - if rectangles are this close, merge them
      
      // Sort rectangles by Y position, then by X position
      rects.sort((a, b) => {
        const yDiff = a.y - b.y
        if (Math.abs(yDiff) > lineTolerance) return yDiff
        return a.x - b.x
      })
      
      let currentMerged = null
      
      rects.forEach((rect, index) => {
        if (currentMerged === null) {
          // Start a new merged rectangle
          currentMerged = { ...rect }
        } else {
          // Check if this rectangle is on the same line and close enough to merge
          const isSameLine = Math.abs(rect.y - currentMerged.y) <= lineTolerance
          const gap = rect.x - (currentMerged.x + currentMerged.width)
          const isCloseEnough = gap <= gapTolerance
          
          if (isSameLine && (gap <= 0 || isCloseEnough)) {
            // Merge: extend the current rectangle to include this one
            const newRight = Math.max(
              currentMerged.x + currentMerged.width,
              rect.x + rect.width
            )
            currentMerged.width = newRight - currentMerged.x
            currentMerged.height = Math.max(currentMerged.height, rect.height)
          } else {
            // Can't merge - save current and start new
            mergedRects.push(currentMerged)
            currentMerged = { ...rect }
          }
        }
      })
      
      // Don't forget the last merged rectangle
      if (currentMerged !== null) {
        mergedRects.push(currentMerged)
      }
      
      return mergedRects.length > 0 ? mergedRects : null
    }
    
    return rects.length > 0 ? rects : null
  }

  // Handle text selection to create highlights (only in highlight mode)
  useEffect(() => {
    if (interactionMode !== 'highlight' && interactionMode !== 'select') {
      // Clear selection overlay when not in highlight or select mode
      Object.values(selectionLayerRefs.current).forEach(layer => {
        if (layer) layer.innerHTML = ''
      })
      // Clear persistent selection and native selection
      persistentSelectionRangeRef.current = null
      const nativeSelection = window.getSelection()
      nativeSelection.removeAllRanges()
      return
    }

    // Render custom selection overlay
    const renderSelectionOverlay = (range, pageNum) => {
      if (!range || !pageNum || !textLayerRefs.current[pageNum]) {
        // Clear selection overlay
        Object.values(selectionLayerRefs.current).forEach(layer => {
          if (layer) layer.innerHTML = ''
        })
        return
      }

      const textLayerDiv = textLayerRefs.current[pageNum]
      const selectionLayer = selectionLayerRefs.current[pageNum]
      if (!selectionLayer) return

      // Clear previous overlay
      selectionLayer.innerHTML = ''

      // Calculate precise rectangles
      const rectangles = calculatePreciseRectangles(range, textLayerDiv)
      if (!rectangles || rectangles.length === 0) return

      // Get highlight color - use light blue for select mode
      const highlightBgColor = interactionMode === 'select' 
        ? 'rgba(173, 216, 230, 0.4)' // Light blue for select mode
        : getHighlightColor(highlightColor)
      
      // Render each rectangle
      rectangles.forEach((rect, index) => {
        // Apply the same height padding as final highlights to maintain consistent height
        // This prevents the visual jump when releasing the mouse button
        const baseHeight = rect.height
        const paddingRatio = Math.max(0.15, Math.min(0.20, 0.15 + (baseHeight / 100) * 0.05))
        const height = baseHeight * (1 + paddingRatio)
        
        const div = document.createElement('div')
        div.className = 'selection-rect'
        div.style.position = 'absolute'
        div.style.left = rect.x + 'px'
        div.style.top = rect.y + 'px'
        div.style.width = rect.width + 'px'
        div.style.height = height + 'px'
        div.style.backgroundColor = highlightBgColor
        div.style.pointerEvents = 'none'
        div.style.zIndex = '3'
        div.style.borderRadius = '2px'
        
        selectionLayer.appendChild(div)
      })
    }


    // Helper function to extract text from a range, preserving spaces between spans
    // Uses the same logic as calculatePreciseRectangles to find selected spans,
    // then extracts from extractedText using charIndex values
    const extractTextFromRange = (range, originalRangeStartContainer = null) => {
      if (!range || range.collapsed || !extractedText) {
        return range ? range.toString() : ''
      }
      
      // Find the text layer
      const commonAncestor = range.commonAncestorContainer
      // If commonAncestor is a text node, get its parent element to use closest()
      const ancestorElement = commonAncestor.nodeType === Node.TEXT_NODE 
        ? commonAncestor.parentElement 
        : commonAncestor
      
      const textLayer = ancestorElement?.closest('.textLayer') || ancestorElement?.closest('.text-layer')
      
      if (!textLayer) {
        return range.toString()
      }
      
      // Get the native selection to check what's actually selected
      // This is more reliable than using the range's DOM boundaries
      const nativeSelection = window.getSelection()
      let actualSelectedRange = null
      if (nativeSelection && nativeSelection.rangeCount > 0) {
        actualSelectedRange = nativeSelection.getRangeAt(0)
      }
      
      // Clone the range to avoid modifying the original
      const clonedRange = range.cloneRange()
      
      // For intersection checks, use the original range (before any expansion)
      // The expanded range may have incorrect boundaries that don't match the DOM structure
      // But for getting the actual selected text, use the actual selected range if available
      const rangeToUse = clonedRange
      
      // Get the actual selected text - this is what the user actually selected
      const actualSelectedText = rangeToUse.toString()
      
      // Use original range start container for column filtering if provided
      // This ensures column filtering works correctly when range is expanded for word boundaries
      const columnFilterStartContainer = originalRangeStartContainer || clonedRange.startContainer
      
      // Get all spans in the text layer (not just those with data-char-index)
      // Some spans may not have charIndex but are still part of the selection
      const allSpans = Array.from(textLayer.querySelectorAll('span'))
      
      // First, find the span that contains the range's endContainer (if it's a text node)
      // This ensures we always include the span where the selection ends
      // Use the rangeToUse which may have more accurate boundaries
      let endContainerSpan = null
      if (rangeToUse.endContainer && rangeToUse.endContainer.nodeType === Node.TEXT_NODE) {
        endContainerSpan = rangeToUse.endContainer.parentElement
        // If it's not in allSpans, try to find a span with matching text content
        if (endContainerSpan && !allSpans.includes(endContainerSpan)) {
          // Try to find a span in allSpans that has the same text content
          const endContainerText = rangeToUse.endContainer.textContent
          endContainerSpan = allSpans.find(s => s.firstChild?.textContent === endContainerText) || null
        }
      }
      
      // Collect all selected spans with their selection info (same logic as calculatePreciseRectangles)
      const selectedSpans = []
      
      allSpans.forEach(span => {
        const textNode = span.firstChild
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return
        
        // Create a range for this span
        const spanRange = document.createRange()
        spanRange.selectNodeContents(span)
        
        // Check if selection intersects with this span (same logic as calculatePreciseRectangles)
        // Use rangeToUse which may have more accurate boundaries
        const startToEnd = rangeToUse.compareBoundaryPoints(Range.START_TO_END, spanRange)
        const endToStart = rangeToUse.compareBoundaryPoints(Range.END_TO_START, spanRange)
        
        // Also check if the range's start or end containers are within this span
        // This handles cases where the range ends at a text node that's the span's firstChild
        // Check if endContainer is the textNode, or if it's a text node whose parent is this span
        const rangeStartsInSpan = rangeToUse.startContainer === textNode || span.contains(rangeToUse.startContainer)
        const endContainerParent = rangeToUse.endContainer?.parentElement
        const rangeEndsInSpan = rangeToUse.endContainer === textNode || 
                                 span.contains(rangeToUse.endContainer) ||
                                 (rangeToUse.endContainer.nodeType === Node.TEXT_NODE && endContainerParent === span)
        
        // Also check if the span is actually selected by the native selection
        // This is a fallback for when DOM boundaries don't match the actual selection
        let isSelectedByNative = false
        if (actualSelectedRange && span) {
          // Check if the span intersects with the actual selected range using intersectsNode
          // This is more reliable than boundary point comparisons
          try {
            isSelectedByNative = actualSelectedRange.intersectsNode(span)
          } catch (e) {
            // Fallback: check if the span's range intersects with the actual selected range
            const nativeStartToSpanEnd = actualSelectedRange.compareBoundaryPoints(Range.START_TO_END, spanRange)
            const nativeEndToSpanStart = actualSelectedRange.compareBoundaryPoints(Range.END_TO_START, spanRange)
            // Intersection: native start < span end AND native end > span start
            isSelectedByNative = nativeStartToSpanEnd < 0 && nativeEndToSpanStart > 0
          }
        }
        
        // Include span if:
        // 1. This span contains the range's endContainer (always include)
        // 2. Range starts or ends within this span (always include)
        // 3. Span is selected by native selection (fallback when DOM boundaries don't match)
        // 4. OR standard intersection check passes (range overlaps with span)
        const isEndContainerSpan = span === endContainerSpan
        
        if (!isEndContainerSpan && !rangeStartsInSpan && !rangeEndsInSpan && !isSelectedByNative) {
          // Only use boundary point check if range doesn't start or end in span and not selected by native
          // Use the same logic as calculatePreciseRectangles for consistency
          if (startToEnd < 0 || endToStart > 0) {
            // No intersection
            return
          }
        }
        
        // Determine the selected portion of this span
        let startOffset = 0
        let endOffset = textNode.textContent.length
        
        // Check if selection starts in this span's text node
        // Use rangeToUse which may have more accurate boundaries
        if (rangeToUse.startContainer === textNode) {
          startOffset = rangeToUse.startOffset
        } else if (span.contains(rangeToUse.startContainer)) {
          // Selection starts within this span
          if (rangeToUse.startContainer.nodeType === Node.TEXT_NODE) {
            startOffset = rangeToUse.startOffset
          } else {
            const startToStart = rangeToUse.compareBoundaryPoints(Range.START_TO_START, spanRange)
            if (startToStart <= 0) {
              startOffset = 0
            }
          }
        } else {
          const startToStart = rangeToUse.compareBoundaryPoints(Range.START_TO_START, spanRange)
          if (startToStart < 0) {
            startOffset = 0
          }
        }
        
        // Check if selection ends in this span's text node
        if (rangeToUse.endContainer === textNode) {
          endOffset = rangeToUse.endOffset
        } else if (span.contains(rangeToUse.endContainer)) {
          if (rangeToUse.endContainer.nodeType === Node.TEXT_NODE) {
            endOffset = rangeToUse.endOffset
          } else {
            const endToEnd = rangeToUse.compareBoundaryPoints(Range.END_TO_END, spanRange)
            if (endToEnd >= 0) {
              endOffset = textNode.textContent.length
            }
          }
        } else {
          const endToEnd = rangeToUse.compareBoundaryPoints(Range.END_TO_END, spanRange)
          if (endToEnd > 0) {
            endOffset = textNode.textContent.length
          }
        }
        
        // Only add if there's actually a selected portion
        if (startOffset < endOffset && startOffset >= 0 && endOffset <= textNode.textContent.length) {
          // Get column index from span (or parent line container)
          let columnIndex = span.dataset.columnIndex
          if (columnIndex === undefined) {
            const lineContainer = span.closest('span[data-column-index]')
            if (lineContainer) {
              columnIndex = lineContainer.dataset.columnIndex
            }
          }
          
          const spanCharIndex = parseInt(span.dataset.charIndex) || 0
          selectedSpans.push({
            span,
            charIndex: spanCharIndex,
            startOffset,
            endOffset,
            columnIndex: columnIndex !== undefined ? parseInt(columnIndex) : null
          })
          
        }
      })
      
      // Filter spans to only include those in the same column as the selection start
      // This prevents extracting text from other columns in multi-column layouts
      // BUT: Always include the endContainerSpan even if it's in a different column
      if (selectedSpans.length > 0) {
        // Find the column index of the span where the selection starts
        let startColumnIndex = null
        
        // Find the span that contains the start of the selection (use original start container for column filtering)
        // Use rangeToUse for more accurate start container
        const startContainerForColumn = columnFilterStartContainer || rangeToUse.startContainer
        for (const spanInfo of selectedSpans) {
          if (spanInfo.span.contains(startContainerForColumn) || 
              spanInfo.span.firstChild === startContainerForColumn) {
            if (spanInfo.columnIndex !== null) {
              startColumnIndex = spanInfo.columnIndex
              break
            }
          }
        }
        
        // If not found, use the first span's column index as fallback
        if (startColumnIndex === null && selectedSpans.length > 0) {
          startColumnIndex = selectedSpans[0].columnIndex
        }
        
        // If we have a valid column index, filter to only include spans in that column
        // Also include spans with null columnIndex to avoid losing spans that don't have the attribute set
        // BUT always include the endContainerSpan even if it's in a different column
        if (startColumnIndex !== null) {
          const filteredSpans = selectedSpans.filter(spanInfo => 
            spanInfo.columnIndex === startColumnIndex || 
            spanInfo.columnIndex === null || 
            spanInfo.span === endContainerSpan
          )
          
          // Only use filtered spans if we have at least one (to avoid losing all selection)
          if (filteredSpans.length > 0) {
            selectedSpans.length = 0
            selectedSpans.push(...filteredSpans)
          }
        }
      }
      
      if (selectedSpans.length === 0) {
        return range.toString()
      }
      
      // Sort spans by their position in the selection range
      // Priority: start container span first, end container span last, then by position relative to selection
      selectedSpans.sort((a, b) => {
        // Check if spans contain start/end containers
        const aContainsStart = a.span.contains(clonedRange.startContainer) || a.span.firstChild === clonedRange.startContainer
        const bContainsStart = b.span.contains(clonedRange.startContainer) || b.span.firstChild === clonedRange.startContainer
        const aContainsEnd = a.span.contains(clonedRange.endContainer) || a.span.firstChild === clonedRange.endContainer
        const bContainsEnd = b.span.contains(clonedRange.endContainer) || b.span.firstChild === clonedRange.endContainer
        
        // Start container span always comes first
        if (aContainsStart && !bContainsStart) return -1
        if (!aContainsStart && bContainsStart) return 1
        
        // End container span always comes last
        if (aContainsEnd && !bContainsEnd) return 1
        if (!aContainsEnd && bContainsEnd) return -1
        
        // For other spans, compare their position relative to the selection range
        // Create ranges for each span
        const aRange = document.createRange()
        aRange.selectNodeContents(a.span)
        const bRange = document.createRange()
        bRange.selectNodeContents(b.span)
        
        // Compare where each span starts relative to the selection range start
        const aStartToSelectionStart = clonedRange.compareBoundaryPoints(Range.START_TO_START, aRange)
        const bStartToSelectionStart = clonedRange.compareBoundaryPoints(Range.START_TO_START, bRange)
        
        // If both are after the selection start, sort by their position
        if (aStartToSelectionStart <= 0 && bStartToSelectionStart <= 0) {
          return aRange.compareBoundaryPoints(Range.START_TO_START, bRange)
        }
        
        // Otherwise, sort by position relative to selection start
        return aStartToSelectionStart - bStartToSelectionStart
      })
      
      // Extract text directly from the filtered spans' textContent
      // This is more reliable than using charIndex to index into extractedText,
      // especially in multi-column layouts where charIndex might not align correctly
      const firstSpan = selectedSpans[0]
      const lastSpan = selectedSpans[selectedSpans.length - 1]
      
      let extractedTextParts = []
      
      // Get Y and X positions for all spans to detect line breaks and word boundaries
      const spanPositions = selectedSpans.map((spanInfo, index) => {
        const rect = spanInfo.span.getBoundingClientRect()
        return {
          spanInfo,
          index,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width
        }
      })
      
      selectedSpans.forEach((spanInfo, index) => {
        const textNode = spanInfo.span.firstChild
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return
        
        const spanText = textNode.textContent
        let textToAdd = ''
        
        if (selectedSpans.length === 1) {
          // Single span - use selected portion only
          textToAdd = spanText.substring(spanInfo.startOffset, spanInfo.endOffset)
        } else if (index === 0) {
          // First span - use from startOffset to end
          textToAdd = spanText.substring(spanInfo.startOffset)
        } else if (index === selectedSpans.length - 1) {
          // Last span - use from start to endOffset
          textToAdd = spanText.substring(0, spanInfo.endOffset)
        } else {
          // Middle spans - use full text
          textToAdd = spanText
        }
        
        if (textToAdd.length > 0) {
          extractedTextParts.push(textToAdd)
          
          // Check if next span is on a different line
          // If so, we'll add a space when joining
          if (index < selectedSpans.length - 1) {
            const currentPos = spanPositions[index]
            const nextPos = spanPositions[index + 1]
            // If Y positions differ significantly (more than 1px tolerance), they're on different lines
            const isDifferentLine = Math.abs(currentPos.top - nextPos.top) > 1
            
            if (isDifferentLine) {
              // Mark that we need a space after this part
              extractedTextParts.push(' ')
            } else {
              // Check if we need a space between spans on same line
              const currentSpanText = spanText
              const nextSpanText = selectedSpans[index + 1]?.span.firstChild?.textContent || ''
              const currentEndsWithSpace = /\s$/.test(textToAdd)
              const nextStartsWithSpace = /^\s/.test(nextSpanText)
              const needsSpace = !currentEndsWithSpace && !nextStartsWithSpace && !!/\S/.test(currentSpanText) && !!/\S/.test(nextSpanText)
              
              // Calculate horizontal gap between spans
              const currentPos = spanPositions[index]
              const nextPos = spanPositions[index + 1]
              const horizontalGap = nextPos ? (nextPos.left - currentPos.right) : 0
              
              // Get font size from the current span to make threshold proportional
              // Try to get fontSize from span style, computed style, or use bounding rect height as fallback
              let fontSize = parseFloat(spanInfo.span.style.fontSize)
              if (isNaN(fontSize) || fontSize === 0) {
                const computedStyle = window.getComputedStyle(spanInfo.span)
                fontSize = parseFloat(computedStyle.fontSize)
              }
              if (isNaN(fontSize) || fontSize === 0) {
                fontSize = currentPos.height || 12 // Fallback to 12px if we can't determine
              }
              
              // Threshold is proportional to font size (e.g., 0.2 * fontSize)
              // For 12px font: threshold = 2.4px, for 24px font: threshold = 4.8px
              const gapThreshold = fontSize * 0.2
              const isLikelySeparateWords = horizontalGap > gapThreshold
              
              const currentIsShort = textToAdd.length <= 2
              const nextIsShort = nextSpanText.length <= 2
              const bothAreWords = !currentIsShort && !nextIsShort
              
              // Add space between consecutive word spans on same line if no space span exists
              // Use horizontal distance between spans to determine if they're separate words
              // If spans are far apart horizontally (proportional to font size), they're likely separate words
              if (needsSpace) {
                // Add space if: horizontal gap suggests separate words OR both are clearly complete words
                if (isLikelySeparateWords || bothAreWords) {
                  extractedTextParts.push(' ')
                }
              }
            }
          }
        }
      })
      
      // Join the text parts (spans are already in correct order)
      // Spaces between lines have already been added above
      const extracted = extractedTextParts.join('')
      
      if (extracted && extracted.length > 0) {
        // CRITICAL: Always return the extracted text from filtered spans
        // Do NOT fall back to range.toString() as it includes text from all columns
        // The extracted text is already filtered by column, so it's the correct result
        // even if it's shorter than the original range text (which includes other columns)
        return extracted
      }
      
      // If no text was extracted from filtered spans, return empty string
      // Do NOT fall back to range.toString() as it would include text from other columns
      // This ensures column filtering is always respected
      return ''
    }

    // Helper function to expand selection to full words
    // Returns the expanded text that includes full words, even if only part of a word was selected
    // But preserves the exact selection if it's already at word boundaries
    const expandSelectionToWords = (range) => {
      if (!range || range.collapsed) {
        return range ? range.toString() : ''
      }

      // Get the actual selected text (what the user sees)
      const nativeSelection = window.getSelection()
      let selectedText = ''
      if (nativeSelection && nativeSelection.rangeCount > 0) {
        selectedText = nativeSelection.toString().trim()
      }
      if (!selectedText) {
        selectedText = range.toString().trim()
      }
      if (!selectedText) {
        return ''
      }
      
      // Check if selection starts/ends in the middle of a word by examining the DOM
      const startContainer = range.startContainer
      const startOffset = range.startOffset
      const endContainer = range.endContainer
      const endOffset = range.endOffset
      
      let isStartInWord = false
      let isEndInWord = false
      
      // Check if start is in the middle of a word
      if (startContainer && startContainer.nodeType === Node.TEXT_NODE) {
        const textBefore = startContainer.textContent.substring(0, startOffset)
        // Check if there's a non-whitespace character immediately before the start
        isStartInWord = textBefore.length > 0 && /\S/.test(textBefore[textBefore.length - 1])
      }
      
      // Check if end is in the middle of a word
      if (endContainer && endContainer.nodeType === Node.TEXT_NODE) {
        const textAtEnd = endContainer.textContent.substring(endOffset)
        // Check if there's a non-whitespace character immediately after the end
        isEndInWord = textAtEnd.length > 0 && /\S/.test(textAtEnd[0])
      }
      
      // If neither start nor end is in the middle of a word, use extractTextFromRange
      // to ensure column filtering is applied (even if selection is at word boundaries)
      if (!isStartInWord && !isEndInWord) {
        if (extractedText) {
          // Pass original start container to ensure column filtering works correctly
          const extracted = extractTextFromRange(range, startContainer).trim()
          if (extracted && extracted.length > 0) {
            return extracted
          }
        }
        // CRITICAL: Do NOT return selectedText (from nativeSelection or range.toString())
        // as it includes text from all columns. Return empty if extractTextFromRange failed.
        // This ensures column filtering is always respected.
        return ''
      }
      
      // We need to expand word boundaries in the DOM
      // Clone the range and expand it to include full words
      const expandedRange = range.cloneRange()
      
      // Expand start backward to include full word
      if (isStartInWord && startContainer && startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = startContainer
        let newStartOffset = startOffset
        
        // Move backward to find word start
        while (newStartOffset > 0 && /\S/.test(textNode.textContent[newStartOffset - 1])) {
          newStartOffset--
        }
        
        expandedRange.setStart(textNode, newStartOffset)
      }
      
      // Expand end forward to include full word
      if (isEndInWord && endContainer && endContainer.nodeType === Node.TEXT_NODE) {
        const textNode = endContainer
        let newEndOffset = endOffset
        
        // Move forward to find word end
        while (newEndOffset < textNode.textContent.length && /\S/.test(textNode.textContent[newEndOffset])) {
          newEndOffset++
        }
        
        expandedRange.setEnd(textNode, newEndOffset)
      }
      
      // Extract text from the expanded range
      // Prefer extractTextFromRange which filters by column in multi-column layouts
      // Pass original range start container to ensure column filtering uses the original selection start
      let expandedText = ''
      if (extractedText) {
        expandedText = extractTextFromRange(expandedRange, startContainer).trim()
      }
      
      // If extractTextFromRange didn't work, try one more time with the original range
      // (not expanded) to ensure we get column-filtered text
      if (!expandedText || expandedText.length === 0) {
        // Try extracting from the original range (before expansion) with column filtering
        if (extractedText) {
          expandedText = extractTextFromRange(range, startContainer).trim()
        }
      }
      
      // CRITICAL: Do NOT fall back to nativeSelection.toString() or expandedRange.toString()
      // as these include text from all columns and bypass column filtering
      // If extractTextFromRange returns empty, it means no text was found in the selected column
      // Return empty string rather than including text from other columns
      
      // Normalize whitespace (collapse multiple spaces to single space, but preserve spaces between words)
      expandedText = expandedText.replace(/\s+/g, ' ').trim()
      
      // Return the expanded text (which now includes full words with proper spacing)
      return expandedText || selectedText
    }

    // Helper function to find the nearest text node to a point
    const findNearestTextNode = (x, y, textLayer) => {
      if (!textLayer) return null
      
      const allSpans = Array.from(textLayer.querySelectorAll('span[data-char-index]'))
      if (allSpans.length === 0) return null
      
      let nearestSpan = null
      let minDistance = Infinity
      
      allSpans.forEach(span => {
        const rect = span.getBoundingClientRect()
        // Calculate distance from point to span center
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2))
        
        // Also check if point is within or near the span
        const isNear = (x >= rect.left - 50 && x <= rect.right + 50 && 
                       y >= rect.top - 50 && y <= rect.bottom + 50)
        
        if (isNear && distance < minDistance) {
          minDistance = distance
          nearestSpan = span
        }
      })
      
      if (nearestSpan && nearestSpan.firstChild && nearestSpan.firstChild.nodeType === Node.TEXT_NODE) {
        return nearestSpan.firstChild
      }
      
      return null
    }

    const getRangeFromPoint = (x, y, allowNearestText = false) => {
      let range = null
      
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(x, y)
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y)
        if (pos) {
          range = document.createRange()
          range.setStart(pos.offsetNode, pos.offset)
          range.setEnd(pos.offsetNode, pos.offset)
        }
      } else {
        // Fallback: use elementFromPoint and find text node
        const element = document.elementFromPoint(x, y)
        if (element) {
          const span = element.closest('.textLayer span') || element.closest('.text-layer span')
          if (span && span.firstChild && span.firstChild.nodeType === Node.TEXT_NODE) {
            range = document.createRange()
            range.setStart(span.firstChild, 0)
            range.setEnd(span.firstChild, 0)
          }
        }
      }
      
      // If no range found and we're allowed to find nearest text, try that
      if (!range && allowNearestText) {
        // Find which text layer we're in
        let textLayer = null
        for (const [page, layer] of Object.entries(textLayerRefs.current)) {
          if (layer) {
            const rect = layer.getBoundingClientRect()
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
              textLayer = layer
              break
            }
          }
        }
        
        if (textLayer) {
          const nearestTextNode = findNearestTextNode(x, y, textLayer)
          if (nearestTextNode) {
            // Determine if we should place cursor at start or end based on position
            const span = nearestTextNode.parentElement
            const rect = span.getBoundingClientRect()
            const isBefore = x < rect.left + rect.width / 2
            const offset = isBefore ? 0 : nearestTextNode.textContent.length
            
            range = document.createRange()
            range.setStart(nearestTextNode, offset)
            range.setEnd(nearestTextNode, offset)
          }
        }
      }
      
      return range
    }

    const handleMouseDown = (e) => {
      // Don't handle if in snipping mode (let snipping tool handle it)
      if (isSnippingMode) {
        return
      }
      
      // In select mode, clear persistent selection if clicking away from text
      if (interactionMode === 'select') {
        const clickedElement = e.target
        const isOnText = clickedElement.classList.contains('text-layer') || 
                        clickedElement.closest('.textLayer span') || 
                        clickedElement.closest('.text-layer span')
        
        // If clicking away from text, clear the persistent selection
        if (!isOnText && !clickedElement.closest('.selection-rect')) {
          // Clear persistent selection
          persistentSelectionRangeRef.current = null
          Object.values(selectionLayerRefs.current).forEach(layer => {
            if (layer) layer.innerHTML = ''
          })
          // Clear native selection
          const nativeSelection = window.getSelection()
          nativeSelection.removeAllRanges()
        }
      }
      
      // Only handle selection in highlight or select mode
      if (interactionMode !== 'highlight' && interactionMode !== 'select') {
        return
      }
      
      // Don't handle if clicking on a highlight (let highlights handle their own events)
      if (e.target.closest('.highlight-rect, .highlight-connection-dot')) {
        return
      }
      
      // Only handle if clicking directly on a text span (not through a highlight)
      const clickedElement = e.target
      if (!clickedElement.classList.contains('text-layer') && 
          !clickedElement.closest('.textLayer span') && !clickedElement.closest('.text-layer span')) {
        return
      }
      
      // Check if there's a highlight rectangle at this position
      const highlightAtPoint = document.elementFromPoint(e.clientX, e.clientY)
      if (highlightAtPoint && highlightAtPoint.closest('.highlight-rect')) {
        return // Let the highlight handle it
      }
      
      // Only handle if clicking in a text layer
      let pageNum = null
      for (const [page, textLayer] of Object.entries(textLayerRefs.current)) {
        if (textLayer && (textLayer.contains(e.target) || textLayer === e.target)) {
          pageNum = parseInt(page)
          break
        }
      }

      if (!pageNum) return
      
      // Clear previous persistent selection when starting a new selection
      if (interactionMode === 'select') {
        persistentSelectionRangeRef.current = null
        // Clear native selection when starting new selection
        const nativeSelection = window.getSelection()
        nativeSelection.removeAllRanges()
      }

      // Don't prevent default - allow native selection to work so we can capture what user sees
      // We'll still use custom overlay for visual feedback
      
      // Get the text node and offset at click position
      let range = getRangeFromPoint(e.clientX, e.clientY)
      
      // Check if click is actually on a text span (not just whitespace)
      let isOnText = false
      if (range) {
        const textNode = range.startContainer
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          const span = textNode.parentElement
          if (span) {
            const rect = span.getBoundingClientRect()
            // Check if click is within the span's bounding box
            isOnText = (e.clientX >= rect.left && e.clientX <= rect.right &&
                       e.clientY >= rect.top && e.clientY <= rect.bottom)
            
            // Also check if there's actual text content
            const text = textNode.textContent
            isOnText = isOnText && text && text.trim().length > 0
          }
        }
      }
      
      // Only start selection if we're actually clicking on text
      // If clicking on whitespace, we'll wait until mouse moves over text
      if (range && isOnText) {
        // Store start of selection
        selectionStartRangeRef.current = range.cloneRange()
        isDraggingSelectionRef.current = true
        // Don't initialize lastValidRangeRef here - wait until we have an actual selection
        // This prevents both start and end from being at the same position
        // lastValidRangeRef will be set in handleMouseMove when we have a non-collapsed selection
      } else {
        // Clicking on whitespace - set dragging flag but don't set start range yet
        // Start range will be set in handleMouseMove when we first hover over text
        isDraggingSelectionRef.current = true
      }
      
      // Don't set native selection here - wait until mouseup
      // Setting it here can interfere with dragging
    }

    const handleMouseMove = (e) => {
      if (!isDraggingSelectionRef.current) return

      // Find which page we're on
      let pageNum = null
      for (const [page, textLayer] of Object.entries(textLayerRefs.current)) {
        const rect = textLayer.getBoundingClientRect()
        if (textLayer && (textLayer.contains(e.target) || 
            (rect.left <= e.clientX && e.clientX <= rect.right && 
             rect.top <= e.clientY && e.clientY <= rect.bottom))) {
          pageNum = parseInt(page)
          break
        }
      }

      if (!pageNum) return

      // If we don't have a start range yet, try to initialize it when we first hover over text
      if (!selectionStartRangeRef.current) {
        let range = getRangeFromPoint(e.clientX, e.clientY)
        if (!range) {
          range = getRangeFromPoint(e.clientX, e.clientY, true)
        }
        if (range) {
          const textNode = range.startContainer
          if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            const span = textNode.parentElement
            if (span) {
              const rect = span.getBoundingClientRect()
              // Check if mouse is actually over the text span
              const isOverText = (e.clientX >= rect.left && e.clientX <= rect.right &&
                                 e.clientY >= rect.top && e.clientY <= rect.bottom)
              const text = textNode.textContent
              if (isOverText && text && text.trim().length > 0) {
                // Set start range to current position (not the beginning of the text node)
                // This ensures we only highlight from where we first hover, not from the start
                selectionStartRangeRef.current = range.cloneRange()
                // Don't initialize lastValidRangeRef here - wait until we have an actual selection
                // This prevents both start and end from being at the same position
                // lastValidRangeRef will be set in handleMouseMove when we have a non-collapsed selection
              }
            }
          }
        }
        // If still no start range, don't render anything yet
        if (!selectionStartRangeRef.current) return
      }

      // Get current position
      let range = getRangeFromPoint(e.clientX, e.clientY)
      
      // If no range found (over whitespace), try to find nearest text
      if (!range) {
        range = getRangeFromPoint(e.clientX, e.clientY, true)
      }
      
      // Check if this range is on actual text (not just whitespace)
      let isValidTextRange = false
      if (range) {
        const textNode = range.startContainer
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          const span = textNode.parentElement
          if (span) {
            const rect = span.getBoundingClientRect()
            // Check if mouse is actually over the text span
            const isOverText = (e.clientX >= rect.left && e.clientX <= rect.right &&
                               e.clientY >= rect.top && e.clientY <= rect.bottom)
            const text = textNode.textContent
            if (isOverText && text && text.trim().length > 0) {
              isValidTextRange = true
            }
          }
        }
      }
      
      // Create selection range from start to current position
      let selectionRange = null
      if (selectionStartRangeRef.current) {
        selectionRange = selectionStartRangeRef.current.cloneRange()
        
        if (isValidTextRange && range) {
          // We're over text - update the selection end and track it
          try {
            // Check BEFORE setEnd if this would create a collapsed range
            // This prevents updating lastValidRangeRef with invalid collapsed positions
            // Compare selectionRange's start position with range's end position
            const wouldBeCollapsed = selectionRange.startContainer === range.endContainer && 
                                     selectionRange.startOffset === range.endOffset
            // Also check BEFORE setEnd if this would create a backwards range (end before start in same container)
            const wouldBeBackwards = selectionRange.startContainer === range.endContainer && 
                                    selectionRange.startOffset > range.endOffset
            
            selectionRange.setEnd(range.endContainer, range.endOffset)
            
            // Only update last valid range if the selection is NOT collapsed AFTER setEnd
            // This ensures we only track valid selections, not cursor positions
            // Check both collapsed property AND explicit offset comparison (in case collapsed property is incorrect)
            // Check wouldBeCollapsed (before setEnd) OR if range is collapsed after setEnd
            const sameContainerAfterSetEnd = selectionRange.startContainer === selectionRange.endContainer
            const sameOffsetAfterSetEnd = selectionRange.startOffset === selectionRange.endOffset
            // Also check if both offsets are 0 in the same container (defensive check for Range API bug)
            // This catches cases where Range API reports collapsed:false but offsets are both 0
            // Check by reference equality first, then fallback to checking if they're the same text node
            const isSameTextNode = sameContainerAfterSetEnd || 
              (selectionRange.startContainer?.nodeType === Node.TEXT_NODE &&
               selectionRange.endContainer?.nodeType === Node.TEXT_NODE &&
               selectionRange.startContainer?.parentElement === selectionRange.endContainer?.parentElement &&
               selectionRange.startContainer?.textContent === selectionRange.endContainer?.textContent)
            const bothOffsetsZero = selectionRange.startOffset === 0 && selectionRange.endOffset === 0
            // Never update lastValidRangeRef with endOffset:0 if startOffset is also 0
            // This prevents overwriting valid selections with collapsed positions
            // If both offsets are 0, treat it as collapsed if they're in the same container or same text node
            const isZeroOffsetCollapsed = bothOffsetsZero && (isSameTextNode || sameContainerAfterSetEnd)
            // Also: if startOffset is 0 and endOffset is 0, don't update lastValidRangeRef
            // This is a defensive check - if both are 0, it's effectively collapsed
            // If both offsets are 0, always treat as collapsed (defensive check)
            // This prevents overwriting valid selections when dragging back to start
            const alwaysCollapsedIfBothZero = bothOffsetsZero
            const isEffectivelyCollapsed = wouldBeCollapsed || selectionRange.collapsed || 
              (isSameTextNode && sameOffsetAfterSetEnd) ||
              isZeroOffsetCollapsed ||
              alwaysCollapsedIfBothZero
            
            // Also check if the range is backwards (end before start in same container)
            // Don't update lastValidRangeRef with backwards positions
            // Use wouldBeBackwards (checked before setEnd) since Range API might normalize backwards ranges
            const isBackwards = wouldBeBackwards || (selectionRange.startContainer === selectionRange.endContainer && 
                               selectionRange.startOffset > selectionRange.endOffset)
            // Additional check: if endOffset is 0 and startOffset > 0 in same container, it's backwards
            // This catches cases where dragging backwards results in endOffset: 0
            const isBackwardsByZeroOffset = selectionRange.startContainer === selectionRange.endContainer && 
                                           selectionRange.startOffset > 0 && selectionRange.endOffset === 0
            // Conservative check: if endOffset is 0 and startOffset > 0, don't update (likely backwards drag)
            // This prevents storing endOffset: 0 which can later create backwards ranges
            const isSuspiciousZeroOffset = selectionRange.startOffset > 0 && selectionRange.endOffset === 0
            
            if (!isEffectivelyCollapsed && !isBackwards && !isBackwardsByZeroOffset && !isSuspiciousZeroOffset) {
              // Update last valid range to the END of the selection, not just cursor position
              // This preserves the actual selection end when we move to whitespace
              // Only update if the range is not collapsed and not backwards
              lastValidRangeRef.current = {
                endContainer: selectionRange.endContainer,
                endOffset: selectionRange.endOffset
              }
            } else {
            }
          } catch (e) {
            console.warn('Failed to set selection end in mouse move:', e)
            return
          }
        } else if (lastValidRangeRef.current) {
          // We're over whitespace - use the last valid selection end
          if (typeof lastValidRangeRef.current === 'object' && 
              lastValidRangeRef.current.endContainer && 
              lastValidRangeRef.current.endOffset !== undefined) {
            // It's stored as an object with endContainer/endOffset
            try {
              selectionRange.setEnd(lastValidRangeRef.current.endContainer, lastValidRangeRef.current.endOffset)
            } catch (e) {
              console.warn('Failed to set selection end from last valid range:', e)
              return
            }
          } else {
            // Legacy: it's a Range object
            try {
              const lastValid = lastValidRangeRef.current.cloneRange ? 
                lastValidRangeRef.current.cloneRange() : lastValidRangeRef.current
              selectionRange.setEnd(lastValid.endContainer, lastValid.endOffset)
            } catch (e) {
              console.warn('Failed to set selection end from last valid range (legacy):', e)
              return
            }
          }
        } else {
          // No valid range and no last valid range
          return
        }
      } else {
        return
      }

      // Render custom overlay
      renderSelectionOverlay(selectionRange, pageNum)
    }

    const handleMouseUp = (e) => {
      if (!isDraggingSelectionRef.current) {
        isDraggingSelectionRef.current = false
        lastValidRangeRef.current = null
        return
      }

      // If we don't have a start range, clear and return
      if (!selectionStartRangeRef.current) {
        isDraggingSelectionRef.current = false
        lastValidRangeRef.current = null
        return
      }

      // Find which page we're on
      // First try from mouse target
      let pageNum = null
      for (const [page, textLayer] of Object.entries(textLayerRefs.current)) {
        if (textLayer && (textLayer.contains(e.target) || textLayer === e.target)) {
          pageNum = parseInt(page)
          break
        }
      }

      // If not found, try from mouse position (might be over whitespace)
      if (!pageNum) {
        for (const [page, textLayer] of Object.entries(textLayerRefs.current)) {
          if (textLayer) {
            const rect = textLayer.getBoundingClientRect()
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
              pageNum = parseInt(page)
              break
            }
          }
        }
      }

      // If still not found, try to find page from selection start range
      if (!pageNum && selectionStartRangeRef.current) {
        const commonAncestor = selectionStartRangeRef.current.commonAncestorContainer
        const textLayer = commonAncestor.closest('.textLayer') || commonAncestor.closest('.text-layer')
        if (textLayer) {
          for (const [page, layer] of Object.entries(textLayerRefs.current)) {
            if (layer === textLayer) {
              pageNum = parseInt(page)
              break
            }
          }
        }
      }

      // If still not found, try from last valid range
      if (!pageNum && lastValidRangeRef.current) {
        const commonAncestor = lastValidRangeRef.current.commonAncestorContainer
        const textLayer = commonAncestor.closest('.textLayer') || commonAncestor.closest('.text-layer')
        if (textLayer) {
          for (const [page, layer] of Object.entries(textLayerRefs.current)) {
            if (layer === textLayer) {
              pageNum = parseInt(page)
              break
            }
          }
        }
      }
      
      if (!pageNum) {
        // Clear selection overlay
        Object.values(selectionLayerRefs.current).forEach(layer => {
          if (layer) layer.innerHTML = ''
        })
        isDraggingSelectionRef.current = false
        selectionStartRangeRef.current = null
        lastValidRangeRef.current = null
        return
      }

      // Get final position
      let range = getRangeFromPoint(e.clientX, e.clientY)
      
      // Check if we're actually over text
      let isOverText = false
      if (range) {
        const textNode = range.startContainer
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          const span = textNode.parentElement
          if (span) {
            const rect = span.getBoundingClientRect()
            isOverText = (e.clientX >= rect.left && e.clientX <= rect.right &&
                         e.clientY >= rect.top && e.clientY <= rect.bottom)
          }
        }
      }
      
      // If no range found (over whitespace), try to find nearest text
      if (!range || !isOverText) {
        const nearestRange = getRangeFromPoint(e.clientX, e.clientY, true)
        if (nearestRange) {
          const textNode = nearestRange.startContainer
          if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            const span = textNode.parentElement
            if (span) {
              const rect = span.getBoundingClientRect()
              const isOverNearestText = (e.clientX >= rect.left && e.clientX <= rect.right &&
                                        e.clientY >= rect.top && e.clientY <= rect.bottom)
              if (isOverNearestText) {
                range = nearestRange
                isOverText = true
              }
            }
          }
        }
      }
      
      // If we still don't have a valid range over text but have a last valid range, use that
      // This handles case where user releases mouse over whitespace
      // Instead of creating a collapsed range, we'll use the stored end position directly when setting the selection end
      if ((!range || !isOverText) && lastValidRangeRef.current) {
        // Check if lastValidRangeRef is stored as an object with endContainer/endOffset
        if (typeof lastValidRangeRef.current === 'object' && 
            lastValidRangeRef.current.endContainer && 
            lastValidRangeRef.current.endOffset !== undefined) {
          // Don't create a collapsed range - we'll use the end position directly when setting selection end
          // Just mark that we should use lastValidRangeRef for the end position
          range = null // Clear range so we know to use lastValidRangeRef directly
        } else {
          // Legacy: it's a Range object
          range = lastValidRangeRef.current.cloneRange ? 
            lastValidRangeRef.current.cloneRange() : lastValidRangeRef.current
        }
      }
      
      // If range is null but we have lastValidRangeRef, we can still proceed
      // We'll use lastValidRangeRef's end position directly when setting the selection end
      if (!range && !(lastValidRangeRef.current && typeof lastValidRangeRef.current === 'object' && 
          lastValidRangeRef.current.endContainer && lastValidRangeRef.current.endOffset !== undefined)) {
        isDraggingSelectionRef.current = false
        selectionStartRangeRef.current = null
        lastValidRangeRef.current = null
        return
      }

      // Validate that range containers are still connected to the DOM
      const validateRangeContainer = (container) => {
        if (!container) return false
        if (container.nodeType === Node.TEXT_NODE) {
          return container.parentElement && container.parentElement.isConnected
        }
        return container.isConnected
      }
      
      // If range is null but we have lastValidRangeRef, skip range validation
      // We'll use lastValidRangeRef directly when creating the selection range
      if (range) {
        // If range containers are not connected, try to use last valid range
        if (!validateRangeContainer(range.startContainer) || !validateRangeContainer(range.endContainer)) {
        if (lastValidRangeRef.current) {
          const lastValid = lastValidRangeRef.current
          if (validateRangeContainer(lastValid.startContainer) && validateRangeContainer(lastValid.endContainer)) {
            range = lastValid.cloneRange()
          } else {
            console.warn('Range containers are not connected and last valid range is also invalid')
            isDraggingSelectionRef.current = false
            selectionStartRangeRef.current = null
            lastValidRangeRef.current = null
            return
          }
        } else {
          console.warn('Range containers are not connected and no last valid range available')
          isDraggingSelectionRef.current = false
          selectionStartRangeRef.current = null
          lastValidRangeRef.current = null
          return
        }
      }
      }
      
      // Also validate selection start range
      if (!validateRangeContainer(selectionStartRangeRef.current.startContainer)) {
        console.warn('Selection start range container is not connected')
        isDraggingSelectionRef.current = false
        selectionStartRangeRef.current = null
        lastValidRangeRef.current = null
        return
      }
      
      // Check if selectionStartRangeRef itself is collapsed - if so, we need to use lastValidRangeRef
      // This can happen when clicking on whitespace and then releasing at the same position
      // Also check explicitly if startOffset === endOffset (defensive check for Range API bug)
      const isStartRangeCollapsed = selectionStartRangeRef.current.collapsed || 
        (selectionStartRangeRef.current.startContainer === selectionStartRangeRef.current.endContainer &&
         selectionStartRangeRef.current.startOffset === selectionStartRangeRef.current.endOffset)
      
      let fixedCollapsedStart = false
      let selectionRange = null
      if (isStartRangeCollapsed && lastValidRangeRef.current && 
          typeof lastValidRangeRef.current === 'object' &&
          lastValidRangeRef.current.endContainer && lastValidRangeRef.current.endOffset !== undefined) {
        // Start range is collapsed - create a new range using lastValidRangeRef instead of cloning
        const endContainer = lastValidRangeRef.current.endContainer
        const endOffset = lastValidRangeRef.current.endOffset
        const startContainer = selectionStartRangeRef.current.startContainer
        const startOffset = selectionStartRangeRef.current.startOffset
        
        // Validate that lastValidRangeRef won't create a collapsed range
        // Check both container equality AND offset equality (defensive check)
        const sameContainer = startContainer === endContainer
        const sameOffset = startOffset === endOffset
        const wouldBeCollapsed = sameContainer && sameOffset
        if (wouldBeCollapsed) {
          // lastValidRangeRef is collapsed - try using range if available and valid
          // But only if range would create a non-collapsed selection
          if (range && isOverText && range.endContainer && range.endOffset !== undefined) {
            const rangeWouldBeCollapsed = startContainer === range.endContainer && startOffset === range.endOffset
            if (!rangeWouldBeCollapsed) {
              // Use range instead - it's valid and non-collapsed
              selectionRange = document.createRange()
              selectionRange.setStart(startContainer, startOffset)
              selectionRange.setEnd(range.endContainer, range.endOffset)
              fixedCollapsedStart = true
            } else {
              // Both lastValidRangeRef and range are collapsed - reject selection
              Object.values(selectionLayerRefs.current).forEach(layer => {
                if (layer) layer.innerHTML = ''
              })
              isDraggingSelectionRef.current = false
              selectionStartRangeRef.current = null
              lastValidRangeRef.current = null
              return
            }
          } else {
            // No valid range fallback - reject selection
            Object.values(selectionLayerRefs.current).forEach(layer => {
              if (layer) layer.innerHTML = ''
            })
            isDraggingSelectionRef.current = false
            selectionStartRangeRef.current = null
            lastValidRangeRef.current = null
            return
          }
        }
        
        // Create a new range in the correct container
        selectionRange = document.createRange()
        if (endContainer.nodeType === Node.TEXT_NODE && endOffset > 0) {
          // Use the actual start position from selectionStartRangeRef, not 0
          // This ensures we highlight from where the user actually started, not from the beginning
          // But only if start and end are in the same container
          if (startContainer === endContainer && startOffset < endOffset) {
            // Same container and start is before end - use actual start position
            selectionRange.setStart(startContainer, startOffset)
            selectionRange.setEnd(endContainer, endOffset)
          } else if (startContainer === endContainer) {
            // Same container but start >= end - use start position and extend end if needed
            selectionRange.setStart(startContainer, startOffset)
            if (endOffset > startOffset) {
              selectionRange.setEnd(endContainer, endOffset)
            } else {
              // End is before or equal to start - extend to end of text node if possible
              const textLength = endContainer.textContent.length
              if (startOffset < textLength) {
                selectionRange.setEnd(endContainer, textLength)
              } else {
                selectionRange.setEnd(endContainer, startOffset)
              }
            }
          } else {
            // Different containers - use start from selectionStartRangeRef, end from lastValidRangeRef
            selectionRange.setStart(startContainer, startOffset)
            selectionRange.setEnd(endContainer, endOffset)
          }
          fixedCollapsedStart = true
        } else {
          // Can't set start before end - this will be handled as collapsed below
          selectionRange.setStart(endContainer, endOffset)
          selectionRange.setEnd(endContainer, endOffset)
        }
      } else {
        // Create final selection range normally
        selectionRange = selectionStartRangeRef.current.cloneRange()
        
        // If selectionStartRangeRef is collapsed, we need to fix it using lastValidRangeRef or range
        if (isStartRangeCollapsed) {
          // Check if we can use lastValidRangeRef to fix the collapsed range
          if (lastValidRangeRef.current && typeof lastValidRangeRef.current === 'object' &&
              lastValidRangeRef.current.endContainer && lastValidRangeRef.current.endOffset !== undefined) {
            // Only reject if using lastValidRangeRef would create a collapsed range in the SAME container
            // If it's a different container, it's a valid multi-node selection
            const sameContainer = selectionRange.startContainer === lastValidRangeRef.current.endContainer
            const sameOffset = selectionRange.startOffset === lastValidRangeRef.current.endOffset
            const wouldBeCollapsed = sameContainer && sameOffset
            // Also check if using lastValidRangeRef would create a backwards range (end before start in same container)
            const wouldBeBackwards = sameContainer && selectionRange.startOffset > lastValidRangeRef.current.endOffset
            // Additional check: if lastValidRangeRef has endOffset: 0 and startOffset > 0 in same container, it's backwards
            const wouldBeBackwardsByZeroOffset = sameContainer && selectionRange.startOffset > 0 && lastValidRangeRef.current.endOffset === 0
            
            if (wouldBeCollapsed || wouldBeBackwards || wouldBeBackwardsByZeroOffset) {
              // lastValidRangeRef would create a collapsed or backwards range - reject
              Object.values(selectionLayerRefs.current).forEach(layer => {
                if (layer) layer.innerHTML = ''
              })
              isDraggingSelectionRef.current = false
              selectionStartRangeRef.current = null
              lastValidRangeRef.current = null
              return
            }
            // Use lastValidRangeRef to fix the collapsed range (different container = valid)
            selectionRange.setEnd(lastValidRangeRef.current.endContainer, lastValidRangeRef.current.endOffset)
            fixedCollapsedStart = true
          } else if (!lastValidRangeRef.current && range && isOverText) {
            // No lastValidRangeRef, try using range
            const wouldBeCollapsed = selectionRange.startContainer === range.endContainer && 
                                     selectionRange.startOffset === range.endOffset
            if (wouldBeCollapsed) {
              // Range would also create a collapsed selection - reject
              Object.values(selectionLayerRefs.current).forEach(layer => {
                if (layer) layer.innerHTML = ''
              })
              isDraggingSelectionRef.current = false
              selectionStartRangeRef.current = null
              lastValidRangeRef.current = null
              return
            }
            // Use range to fix the collapsed range
            selectionRange.setEnd(range.endContainer, range.endOffset)
            fixedCollapsedStart = true
          } else {
            // No way to fix collapsed range - reject
            Object.values(selectionLayerRefs.current).forEach(layer => {
              if (layer) layer.innerHTML = ''
            })
            isDraggingSelectionRef.current = false
            selectionStartRangeRef.current = null
            lastValidRangeRef.current = null
            return
          }
        }
        
        // If range is null (we're over whitespace) and we haven't fixed the collapsed start yet,
        // we need to set the end using lastValidRangeRef
        if (!range && !fixedCollapsedStart && lastValidRangeRef.current && typeof lastValidRangeRef.current === 'object' &&
            lastValidRangeRef.current.endContainer && lastValidRangeRef.current.endOffset !== undefined) {
          // Validate that lastValidRangeRef won't create a collapsed range
          const wouldBeCollapsed = selectionRange.startContainer === lastValidRangeRef.current.endContainer && 
                                   selectionRange.startOffset === lastValidRangeRef.current.endOffset
          // Also check if it would create a backwards range (end before start in same container)
          const wouldBeBackwards = selectionRange.startContainer === lastValidRangeRef.current.endContainer && 
                                  selectionRange.startOffset > lastValidRangeRef.current.endOffset
          // Additional check: if lastValidRangeRef has endOffset: 0 and startOffset > 0 in same container, it's backwards
          const wouldBeBackwardsByZeroOffset = selectionRange.startContainer === lastValidRangeRef.current.endContainer && 
                                              selectionRange.startOffset > 0 && lastValidRangeRef.current.endOffset === 0
          if (wouldBeCollapsed || wouldBeBackwards || wouldBeBackwardsByZeroOffset) {
            // Clear selection overlay
            Object.values(selectionLayerRefs.current).forEach(layer => {
              if (layer) layer.innerHTML = ''
            })
            isDraggingSelectionRef.current = false
            selectionStartRangeRef.current = null
            lastValidRangeRef.current = null
            return
          }
          // We're over whitespace - set the end to lastValidRangeRef's end position
          selectionRange.setEnd(lastValidRangeRef.current.endContainer, lastValidRangeRef.current.endOffset)
          fixedCollapsedStart = true // Mark as fixed so we don't overwrite it below
        }
      }
      // Use the end position of the range (which could be from last valid range if over whitespace)
      // Skip this if we already fixed the collapsed start - we don't want to overwrite our fix
      if (!fixedCollapsedStart) {
      // Priority: If we have lastValidRangeRef and it's different from the current range, use that
      // This ensures we use the actual selection end, not a collapsed range
      // Also check if using range would create a collapsed selection - if so, prefer lastValidRangeRef
      try {
        // Check if using range would create a collapsed selection
        let wouldBeCollapsed = false
        if (range && selectionRange.startContainer === range.endContainer && 
            selectionRange.startOffset === range.endOffset) {
          wouldBeCollapsed = true
        }
        
        // If we're over whitespace OR range would be collapsed, prefer lastValidRangeRef
        if ((!isOverText || wouldBeCollapsed) && lastValidRangeRef.current && typeof lastValidRangeRef.current === 'object' && 
            lastValidRangeRef.current.endContainer && lastValidRangeRef.current.endOffset !== undefined) {
          // We're over whitespace - prioritize lastValidRangeRef over range
          // This ensures we use the actual selection end position, not a collapsed range
          const startContainer = selectionRange.startContainer
          const startOffset = selectionRange.startOffset
          const endContainer = lastValidRangeRef.current.endContainer
          const endOffset = lastValidRangeRef.current.endOffset
          
          // Check if start and end would be the same (collapsed)
          const wouldBeCollapsedUsingLastValid = startContainer === endContainer && startOffset === endOffset
          // Check if it would create a backwards range (end before start in same container)
          const wouldBeBackwardsUsingLastValid = startContainer === endContainer && startOffset > endOffset
          
          if (wouldBeCollapsedUsingLastValid || wouldBeBackwardsUsingLastValid) {
            // Would be collapsed or backwards - try to extend to end of text node if possible
            if (endContainer.nodeType === Node.TEXT_NODE && !wouldBeBackwardsUsingLastValid) {
              const textLength = endContainer.textContent.length
              if (endOffset < textLength) {
                // Extend to end of text node
                selectionRange.setEnd(endContainer, textLength)
              } else {
                // Already at end, can't extend - this is a collapsed selection, will be handled below
                selectionRange.setEnd(endContainer, endOffset)
              }
            } else {
              // Can't fix backwards or collapsed range - will be handled below
              selectionRange.setEnd(endContainer, endOffset)
            }
          } else {
            // Start and end are different and not backwards - safe to set
            selectionRange.setEnd(endContainer, endOffset)
          }
        } else if (range && isOverText) {
          // We're over text - use the range directly
          // But first check if this would create a collapsed selection
          const wouldBeCollapsedUsingRange = selectionRange.startContainer === range.endContainer && 
              selectionRange.startOffset === range.endOffset
          if (wouldBeCollapsedUsingRange) {
            // Would be collapsed - prefer lastValidRangeRef if available
            if (lastValidRangeRef.current && typeof lastValidRangeRef.current === 'object' &&
                lastValidRangeRef.current.endContainer && lastValidRangeRef.current.endOffset !== undefined &&
                (lastValidRangeRef.current.endContainer !== selectionRange.startContainer ||
                 lastValidRangeRef.current.endOffset !== selectionRange.startOffset)) {
              // Use lastValidRangeRef instead
              selectionRange.setEnd(lastValidRangeRef.current.endContainer, lastValidRangeRef.current.endOffset)
            } else {
              // No valid alternative - use range (will be handled as collapsed below)
              selectionRange.setEnd(range.endContainer, range.endOffset)
            }
          } else {
            // Not collapsed - safe to use
            selectionRange.setEnd(range.endContainer, range.endOffset)
          }
        } else if (lastValidRangeRef.current && typeof lastValidRangeRef.current === 'object' && 
                   lastValidRangeRef.current.endContainer && lastValidRangeRef.current.endOffset !== undefined) {
          // Use lastValidRangeRef's end position directly (don't create a collapsed range first)
          // But first check if this would create a collapsed range - if so, we need to handle it differently
          const startContainer = selectionRange.startContainer
          const startOffset = selectionRange.startOffset
          const endContainer = lastValidRangeRef.current.endContainer
          const endOffset = lastValidRangeRef.current.endOffset
          
          // Check if start and end would be the same (collapsed)
          if (startContainer === endContainer && startOffset === endOffset) {
            // Start and end are the same - this means the user clicked and released at the same position
            // We should not create a highlight in this case, but let's check if we can extend the end
            if (endContainer.nodeType === Node.TEXT_NODE) {
              const textLength = endContainer.textContent.length
              if (endOffset < textLength) {
                // Extend to end of text node
                selectionRange.setEnd(endContainer, textLength)
              } else {
                // Already at end, can't extend - this is a collapsed selection, will be handled below
                selectionRange.setEnd(endContainer, endOffset)
              }
            } else {
              selectionRange.setEnd(endContainer, endOffset)
            }
          } else {
            // Start and end are different - safe to set
            selectionRange.setEnd(endContainer, endOffset)
          }
        } else {
          throw new Error('No valid range or lastValidRangeRef available')
        }
      } catch (e) {
        // If setting end fails, try using start position of the range
        console.warn('Failed to set end of selection range, using start position:', e)
        try {
          selectionRange.setEnd(range.startContainer, range.startOffset)
        } catch (e2) {
          console.warn('Failed to set end of selection range with start position:', e2)
          // If both fail, try to extend to end of the text node
          if (range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
            const textNode = range.startContainer
            const textLength = textNode.textContent.length
            try {
              selectionRange.setEnd(textNode, textLength)
            } catch (e3) {
              console.warn('Failed to set end to text node end:', e3)
              isDraggingSelectionRef.current = false
              selectionStartRangeRef.current = null
              lastValidRangeRef.current = null
              return
            }
          } else {
            isDraggingSelectionRef.current = false
            selectionStartRangeRef.current = null
            lastValidRangeRef.current = null
            return
          }
        }
      }
      
      // Check if selection is collapsed (no actual selection)
      if (selectionRange.collapsed) {
        // If collapsed, try to extend to end of the text node if we're using last valid range
        // Also check if we're using lastValidRangeRef directly (range is null)
        if ((!isOverText || !range) && lastValidRangeRef.current && 
            typeof lastValidRangeRef.current === 'object' &&
            lastValidRangeRef.current.endContainer) {
          const endContainer = lastValidRangeRef.current.endContainer
          if (endContainer.nodeType === Node.TEXT_NODE) {
            const textNode = endContainer
            const textLength = textNode.textContent.length
            const endOffset = lastValidRangeRef.current.endOffset
            // Only extend if the end offset is not already at the end
            if (endOffset < textLength) {
              try {
                selectionRange.setEnd(textNode, textLength)
              } catch (e) {
                // If that fails, clear and return
                Object.values(selectionLayerRefs.current).forEach(layer => {
                  if (layer) layer.innerHTML = ''
                })
                isDraggingSelectionRef.current = false
                selectionStartRangeRef.current = null
                lastValidRangeRef.current = null
                return
              }
            } else {
              // End is already at text length, check if start is before end
              if (selectionRange.startOffset < endOffset) {
                // Start is before end, so selection should not be collapsed
                // This might be a range comparison issue, try setting end again
                try {
                  selectionRange.setEnd(textNode, endOffset)
                } catch (e) {
                }
              }
            }
          }
        } else if (!isOverText && lastValidRangeRef.current && range && range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
          // Fallback: try using range.startContainer
          const textNode = range.startContainer
          const textLength = textNode.textContent.length
          try {
            selectionRange.setEnd(textNode, textLength)
          } catch (e) {
            // If that fails, clear and return
            Object.values(selectionLayerRefs.current).forEach(layer => {
              if (layer) layer.innerHTML = ''
            })
            isDraggingSelectionRef.current = false
            selectionStartRangeRef.current = null
            lastValidRangeRef.current = null
            return
          }
        }
      }
      
      // Check again if still collapsed after extension attempts
      // Check both the collapsed property AND explicit offset comparison (Range API can be unreliable)
      const isStillCollapsed = selectionRange.collapsed || 
                              (selectionRange.startContainer === selectionRange.endContainer && 
                               selectionRange.startOffset === selectionRange.endOffset)
      if (isStillCollapsed) {
          // Clear selection overlay
          Object.values(selectionLayerRefs.current).forEach(layer => {
            if (layer) layer.innerHTML = ''
          })
          isDraggingSelectionRef.current = false
          selectionStartRangeRef.current = null
          lastValidRangeRef.current = null
          return
        }
      }
      
      // Ensure selection range is valid - start should be before end
      // If not, swap them
      // But skip swap if we just fixed the collapsed start - the range should already be correct
      const startToEnd = selectionRange.compareBoundaryPoints(Range.START_TO_END, selectionRange)
      // Only swap if we didn't just fix the collapsed start and the range is actually backwards
      // If we fixed it, the range should already be correct (start=0, end=lastValidOffset)
      if (startToEnd > 0 && !fixedCollapsedStart) {
        // Selection is backwards, swap start and end
        const startContainer = selectionRange.startContainer
        const startOffset = selectionRange.startOffset
        const endContainer = selectionRange.endContainer
        const endOffset = selectionRange.endOffset
        selectionRange.setStart(endContainer, endOffset)
        selectionRange.setEnd(startContainer, startOffset)
      }
      
      // Final validation - ensure the range is not collapsed after all adjustments
      // Check both the collapsed property AND explicit offset comparison (Range API can be unreliable)
      // A range is collapsed ONLY if:
      // 1. Same container AND same offset, OR
      // 2. Range has zero length (no text selected)
      const sameContainer = selectionRange.startContainer === selectionRange.endContainer
      const sameOffset = selectionRange.startOffset === selectionRange.endOffset
      const isExplicitlyCollapsed = sameContainer && sameOffset
      
      // Check if range has zero length (no text selected) - this is the definitive test
      // Note: toString() works across multiple text nodes, so this catches all collapsed cases
      const rangeLength = selectionRange.toString().length
      const hasZeroLength = rangeLength === 0
      
      // Only treat as collapsed if same container AND same offset, OR if zero length
      // If containers are different, even with same offset, it's a valid selection across nodes
      const isEffectivelyCollapsed = isExplicitlyCollapsed || hasZeroLength
      
      if (selectionRange.collapsed || isEffectivelyCollapsed) {
        Object.values(selectionLayerRefs.current).forEach(layer => {
          if (layer) layer.innerHTML = ''
        })
        isDraggingSelectionRef.current = false
        selectionStartRangeRef.current = null
        lastValidRangeRef.current = null
        return
      }
      
      
      // Update native selection to match our range so we can capture the text
      const nativeSelection = window.getSelection()
      nativeSelection.removeAllRanges()
      try {
        nativeSelection.addRange(selectionRange.cloneRange())
      } catch (e) {
        // Range might be invalid, continue with fallback methods
        console.warn('Failed to add range to selection:', e)
      }

      // Calculate precise rectangles FIRST (before expanding text)
      // This preserves the visual selection as the user sees it
      const textLayerDiv = textLayerRefs.current[pageNum]
      if (!textLayerDiv) {
        isDraggingSelectionRef.current = false
        return
      }

      let rectangles = calculatePreciseRectangles(selectionRange, textLayerDiv)
      
      
      // If rectangles calculation failed, try fallback using getClientRects
      if (!rectangles || rectangles.length === 0) {
        try {
          const clientRects = selectionRange.getClientRects()
          const textLayerRect = textLayerDiv.getBoundingClientRect()
          const fallbackRects = []
          for (let i = 0; i < clientRects.length; i++) {
            const rect = clientRects[i]
            if (rect.width > 0 && rect.height > 0) {
              fallbackRects.push({
                x: rect.left - textLayerRect.left,
                y: rect.top - textLayerRect.top,
                width: rect.width,
                height: rect.height
              })
            }
          }
          if (fallbackRects.length > 0) {
            rectangles = fallbackRects
          }
        } catch (e) {
          console.warn('Failed to get client rects as fallback:', e)
        }
      }
      
      // If still no rectangles, try using bounding rect
      if (!rectangles || rectangles.length === 0) {
        try {
          const boundingRect = selectionRange.getBoundingClientRect()
          const textLayerRect = textLayerDiv.getBoundingClientRect()
          if (boundingRect.width > 0 && boundingRect.height > 0) {
            rectangles = [{
              x: boundingRect.left - textLayerRect.left,
              y: boundingRect.top - textLayerRect.top,
              width: boundingRect.width,
              height: boundingRect.height
            }]
          }
        } catch (e) {
          console.warn('Failed to get bounding rect as fallback:', e)
        }
      }
      
      // Now expand the selection to full words for the highlights-editor
      // This ensures that when user highlights any portion of a word, the whole word gets added
      // But the visual highlight (rectangles) remains as the user selected it
      let selectedText = expandSelectionToWords(selectionRange)
      
      // Fallback: If expansion failed, try native selection
      if (!selectedText || selectedText.length === 0) {
        selectedText = nativeSelection.toString().trim()
      }
      
      // Fallback: If native selection is empty, use range text directly
      if (!selectedText || selectedText.length === 0) {
        selectedText = selectionRange.toString().trim()
      }
      
      // Final fallback: Use custom extraction only if both above fail
      if (!selectedText || selectedText.length === 0) {
        selectedText = extractTextFromRange(selectionRange).trim()
      }
      
      if (selectedText.length === 0) {
        // Clear selection overlay
        Object.values(selectionLayerRefs.current).forEach(layer => {
          if (layer) layer.innerHTML = ''
        })
        isDraggingSelectionRef.current = false
        selectionStartRangeRef.current = null
        persistentSelectionRangeRef.current = null
        // Clear native selection
        nativeSelection.removeAllRanges()
        return
      }
      
      // In select mode, persist the selection so user can copy it
      if (interactionMode === 'select') {
        // Store the selection range for persistence
        persistentSelectionRangeRef.current = selectionRange.cloneRange()
        
        // Set the native browser selection so Cmd+C/Ctrl+C works
        try {
          nativeSelection.removeAllRanges()
          nativeSelection.addRange(selectionRange)
        } catch (e) {
          // If addRange fails (e.g., range is detached), try to recreate it
          console.warn('Failed to set native selection, trying to recreate range:', e)
          try {
            const newRange = document.createRange()
            newRange.setStart(selectionRange.startContainer, selectionRange.startOffset)
            newRange.setEnd(selectionRange.endContainer, selectionRange.endOffset)
            nativeSelection.removeAllRanges()
            nativeSelection.addRange(newRange)
          } catch (e2) {
            console.warn('Failed to recreate and set native selection:', e2)
          }
        }
        
        // Keep the selection overlay visible (it's already rendered)
        // Don't clear it - it will persist until user clicks away
        
        // Reset dragging state but keep the selection
        isDraggingSelectionRef.current = false
        selectionStartRangeRef.current = null
        lastValidRangeRef.current = null
        
        // Re-render the selection overlay to ensure it's visible
        renderSelectionOverlay(selectionRange, pageNum)
        
        return
      }
      
      // Clear native selection after capturing (we use custom overlay for display)
      nativeSelection.removeAllRanges()
      
      if (rectangles && rectangles.length > 0) {
        // Get page info to store scale and text layer dimensions
        const pageInfo = pageData.find(p => p.pageNum === pageNum)
        const scale = pageInfo ? pageScale : 1.5
        
        // Get text layer dimensions at creation time for proper scaling when viewport changes
        const textLayer = textLayerRefs.current[pageNum]
        const textLayerRect = textLayer ? textLayer.getBoundingClientRect() : null
        const textLayerWidthAtCreation = textLayerRect ? textLayerRect.width : null
        const textLayerHeightAtCreation = textLayerRect ? textLayerRect.height : null
        
        // Extract column index from selection range for column-aware sorting
        // Pass rectangles and textLayerDiv as fallback parameters
        const columnIndex = getColumnIndexFromRange(selectionRange, textLayerDiv, rectangles)
        
        // Create highlight with array of rectangles (visual selection)
        // But use expanded text (full words) for the highlights-editor
        const highlight = {
          id: Date.now() + Math.random(),
          page: pageNum,
          rects: rectangles,
          text: selectedText, // This now contains full words even if only part was selected
          color: highlightColor,
          scale,
          textLayerWidth: textLayerWidthAtCreation,
          textLayerHeight: textLayerHeightAtCreation,
          columnIndex: columnIndex // Store column index for sorting (null for non-column PDFs)
        }
        
        // Add to history for undo/redo
        setHighlights(prev => {
          const newHighlights = [...prev, highlight]
          setHighlightHistory(hist => {
            const currentIdx = historyIndexRef.current
            // Prevent duplicate entries: if the last history entry already matches newHighlights, don't add a new entry
            const lastEntry = hist[currentIdx]
            if (lastEntry && lastEntry.length === newHighlights.length && 
                lastEntry.every((h, i) => h.id === newHighlights[i]?.id)) {
              return hist
            }
            const newHistory = hist.slice(0, currentIdx + 1)
            newHistory.push(newHighlights)
            const newIdx = newHistory.length - 1
            historyIndexRef.current = newIdx
            setHistoryIndex(newIdx)
            return newHistory
          })
          
          // Auto-save highlights to Firestore immediately (skip during initial load)
          if (!isInitialLoadRef.current) {
            updateDocumentField('highlights', newHighlights).catch(err => {
              console.error('Failed to save highlights:', err)
            })
          }
          
          return newHighlights
        })
        
        // Note: Don't save highlightItems directly - let the useEffect (line 11700) 
        // create sorted highlightItems from highlights based on text position
        // This ensures highlights are always ordered by their position in the text, not creation order
      } else {
        // No rectangles calculated - log warning with details for debugging
        console.warn('No rectangles calculated for selection', {
          hasSelectionRange: !!selectionRange,
          isCollapsed: selectionRange?.collapsed,
          hasSelectedText: selectedText.length > 0,
          pageNum,
          hasTextLayer: !!textLayerDiv,
          selectionStart: selectionRange ? {
            container: selectionRange.startContainer?.nodeName,
            offset: selectionRange.startOffset
          } : null,
          selectionEnd: selectionRange ? {
            container: selectionRange.endContainer?.nodeName,
            offset: selectionRange.endOffset
          } : null
        })
      }

      // Clear selection overlay and reset state (but keep persistent selection in select mode)
      if (interactionMode !== 'select' || !persistentSelectionRangeRef.current) {
        Object.values(selectionLayerRefs.current).forEach(layer => {
          if (layer) layer.innerHTML = ''
        })
      }

      isDraggingSelectionRef.current = false
      selectionStartRangeRef.current = null
      lastValidRangeRef.current = null
    }
    
    // Handle clicks to clear persistent selection when clicking away
    const handleDocumentClick = (e) => {
      if (interactionMode !== 'select' || !persistentSelectionRangeRef.current) {
        return
      }
      
      // Check if click is on text or selection overlay
      const clickedElement = e.target
      const isOnText = clickedElement.classList.contains('text-layer') || 
                      clickedElement.closest('.textLayer span') || 
                      clickedElement.closest('.text-layer span') ||
                      clickedElement.closest('.selection-rect')
      
      // If clicking away from text and selection, clear persistent selection
      if (!isOnText && !clickedElement.closest('.reader-toolbar') && 
          !clickedElement.closest('.reader-controls-panel') && 
          !clickedElement.closest('.sidebar')) {
        persistentSelectionRangeRef.current = null
        Object.values(selectionLayerRefs.current).forEach(layer => {
          if (layer) layer.innerHTML = ''
        })
        // Clear native selection
        const nativeSelection = window.getSelection()
        nativeSelection.removeAllRanges()
      }
    }

    // Add event listeners
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('click', handleDocumentClick)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('click', handleDocumentClick)
    }
  }, [textItems, pageData, pageScale, interactionMode, highlightColor, isSnippingMode])

  // Keep persistent selection visible in select mode
  useEffect(() => {
    if (interactionMode !== 'select' || !persistentSelectionRangeRef.current) {
      return
    }

    // Find which page the selection is on
    const range = persistentSelectionRangeRef.current
    const commonAncestor = range.commonAncestorContainer
    const ancestorElement = commonAncestor.nodeType === Node.TEXT_NODE 
      ? commonAncestor.parentElement 
      : commonAncestor
    const textLayer = ancestorElement?.closest('.textLayer') || ancestorElement?.closest('.text-layer')
    
    if (!textLayer) return

    // Find page number
    let pageNum = null
    for (const [page, layer] of Object.entries(textLayerRefs.current)) {
      if (layer === textLayer) {
        pageNum = parseInt(page)
        break
      }
    }

    if (!pageNum) return

    // Re-render the selection overlay
    const textLayerDiv = textLayerRefs.current[pageNum]
    const selectionLayer = selectionLayerRefs.current[pageNum]
    if (!selectionLayer || !textLayerDiv) return

    // Clear previous overlay
    selectionLayer.innerHTML = ''

    // Calculate precise rectangles
    const calculatePreciseRectangles = (range, textLayerDiv) => {
      if (!range || range.collapsed) return []
      
      const rects = []
      const walker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (!range.intersectsNode(node)) {
              return NodeFilter.FILTER_REJECT
            }
            return NodeFilter.FILTER_ACCEPT
          }
        }
      )

      let node
      while (node = walker.nextNode()) {
        const nodeRange = document.createRange()
        nodeRange.selectNodeContents(node)
        
        if (range.startContainer === node && range.startOffset > 0) {
          nodeRange.setStart(node, range.startOffset)
        }
        if (range.endContainer === node && range.endOffset < node.textContent.length) {
          nodeRange.setEnd(node, range.endOffset)
        }
        
        const rect = nodeRange.getBoundingClientRect()
        const textLayerRect = textLayerDiv.getBoundingClientRect()
        
        if (rect.width > 0 && rect.height > 0) {
          rects.push({
            x: rect.left - textLayerRect.left,
            y: rect.top - textLayerRect.top,
            width: rect.width,
            height: rect.height
          })
        }
      }
      
      return rects
    }

    const rectangles = calculatePreciseRectangles(range, textLayerDiv)
    if (!rectangles || rectangles.length === 0) return

    // Render each rectangle with light blue color
    rectangles.forEach((rect) => {
      const baseHeight = rect.height
      const paddingRatio = Math.max(0.15, Math.min(0.20, 0.15 + (baseHeight / 100) * 0.05))
      const height = baseHeight * (1 + paddingRatio)
      
      const div = document.createElement('div')
      div.className = 'selection-rect'
      div.style.position = 'absolute'
      div.style.left = rect.x + 'px'
      div.style.top = rect.y + 'px'
      div.style.width = rect.width + 'px'
      div.style.height = height + 'px'
      div.style.backgroundColor = 'rgba(173, 216, 230, 0.4)'
      div.style.pointerEvents = 'none'
      div.style.zIndex = '3'
      div.style.borderRadius = '2px'
      
      selectionLayer.appendChild(div)
    })
  }, [interactionMode, pageScale, textLayerRefs, selectionLayerRefs])

  // Render highlights on pages
  useEffect(() => {
    // Don't clear highlights if they're already rendered correctly
    // Only clear if highlights array changed or pageScale changed
    const shouldClear = true // Always clear to ensure fresh render
    
    if (shouldClear) {
      // Clear all highlight layers first
      Object.values(highlightLayerRefs.current).forEach(layer => {
        if (layer) {
          layer.innerHTML = ''
        }
      })
    }

    // Re-render all highlights
    highlights.forEach(highlight => {
      const highlightLayer = highlightLayerRefs.current[highlight.page]
      if (highlightLayer) {
        renderHighlight(highlight, highlightLayer)
      }
    })
  }, [highlights, pageData, renderedPages, pageScale, hoveredHighlightId, connectingFrom, interactionMode, textLayerVisible])

  // Re-render highlights immediately when viewport resizes (e.g., dev tools open/close)
  // This runs independently of renderPages() for instant updates
  useEffect(() => {
    if (highlights.length === 0) return

    let rafId = null
    let isResizing = false

    const handleResize = () => {
      // Cancel any pending animation frame
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
      
      isResizing = true
      
      // Re-render highlights immediately - don't wait for anything
      // Canvas dimensions update instantly on resize (CSS scaling), so we can use them right away
      highlights.forEach(highlight => {
        const highlightLayer = highlightLayerRefs.current[highlight.page]
        const canvas = canvasRefs.current[highlight.page]
        // Only re-render if layers exist
        if (highlightLayer && canvas) {
          renderHighlight(highlight, highlightLayer)
        }
      })
      
      // Also schedule a re-render on next frame in case layout hasn't fully updated yet
      rafId = requestAnimationFrame(() => {
        highlights.forEach(highlight => {
          const highlightLayer = highlightLayerRefs.current[highlight.page]
          const canvas = canvasRefs.current[highlight.page]
          if (highlightLayer && canvas) {
            renderHighlight(highlight, highlightLayer)
          }
        })
        isResizing = false
        rafId = null
      })
    }

    // Throttle to once per frame, but trigger immediately
    let lastResizeTime = 0
    const throttledResize = () => {
      const now = Date.now()
      if (now - lastResizeTime >= 16) { // ~60fps
        lastResizeTime = now
        handleResize()
      } else {
        // Schedule for next frame
        if (!rafId) {
          rafId = requestAnimationFrame(handleResize)
        }
      }
    }

    window.addEventListener('resize', throttledResize)

    return () => {
      window.removeEventListener('resize', throttledResize)
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [highlights])

  // Re-render highlights when sidebar is collapsed/expanded or width changes
  // This fixes the issue where highlights get displaced when sidebar is minimized
  useEffect(() => {
    if (highlights.length === 0) return

    let rafId = null
    let timeoutId = null

    const reRenderHighlights = () => {
      // Re-render all highlights to account for new canvas dimensions
      highlights.forEach(highlight => {
        const highlightLayer = highlightLayerRefs.current[highlight.page]
        const canvas = canvasRefs.current[highlight.page]
        if (highlightLayer && canvas) {
          renderHighlight(highlight, highlightLayer)
        }
      })
    }

    // Use both timeout and requestAnimationFrame to ensure layout has fully updated
    // Timeout allows CSS transitions to complete, RAF ensures DOM has updated
    timeoutId = setTimeout(() => {
      // Re-render immediately
      reRenderHighlights()
      
      // Also schedule a re-render on next frame in case layout hasn't fully updated yet
      rafId = requestAnimationFrame(() => {
        reRenderHighlights()
        rafId = null
      })
    }, 150) // Delay to allow CSS transitions to complete

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [isSidebarCollapsed, sidebarWidth, highlights])

  // Re-render highlights when returning from full view components
  // This ensures highlights are correctly positioned after pages are re-rendered
  // We use a ref to track previous state to detect when we return from full view
  const prevFullViewStateRef = useRef({ timeline: false, summary: false, highlights: false })
  useEffect(() => {
    if (highlights.length === 0) return
    
    // Check if we just returned from a full view (state changed from true to false)
    const wasInFullView = prevFullViewStateRef.current.timeline || 
                         prevFullViewStateRef.current.summary || 
                         prevFullViewStateRef.current.highlights
    const isInFullView = isTimelineExpanded || isSummaryExpanded || isHighlightsExpanded
    const justReturnedFromFullView = wasInFullView && !isInFullView && pdfDoc
    
    // Update previous state
    prevFullViewStateRef.current = {
      timeline: isTimelineExpanded,
      summary: isSummaryExpanded,
      highlights: isHighlightsExpanded
    }
    
    if (justReturnedFromFullView) {
      let rafId = null
      let timeoutId = null

      const reRenderHighlights = () => {
        // Re-render all highlights to account for new canvas dimensions
        highlights.forEach(highlight => {
          const highlightLayer = highlightLayerRefs.current[highlight.page]
          const canvas = canvasRefs.current[highlight.page]
          if (highlightLayer && canvas) {
            renderHighlight(highlight, highlightLayer)
          }
        })
      }

      // Wait for pages to be fully rendered and scroll position to be restored
      timeoutId = setTimeout(() => {
        // Re-render immediately
        reRenderHighlights()
        
        // Also schedule a re-render on next frame in case layout hasn't fully updated yet
        rafId = requestAnimationFrame(() => {
          reRenderHighlights()
          rafId = null
        })
      }, 400) // Delay to allow pages to render and scroll position to be restored

      return () => {
        if (timeoutId) clearTimeout(timeoutId)
        if (rafId) cancelAnimationFrame(rafId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimelineExpanded, isSummaryExpanded, isHighlightsExpanded, pdfDoc, highlights])

  // Re-render TTS reading highlights (blue/green) when viewport, zoom, or layout changes
  // This ensures reading highlights maintain their position on text during all viewport changes
  useEffect(() => {
    // Only re-render if there's an active reading highlight
    if (!currentReadingElementRef.current || !hasCurrentReadingPosition) return

    let rafId = null
    let timeoutId = null
    let resizeObserver = null

    const reRenderReadingHighlight = () => {
      const element = currentReadingElementRef.current
      // Double-check element is still valid and connected
      if (!element || !element.isConnected || !hasCurrentReadingPosition) return

      // Re-apply the reading highlight to update overlay position
      // This will recalculate bounding boxes and reposition the haze overlay
      applyReadingHighlight(element, false)
    }

    const handleLayoutChange = () => {
      // Only proceed if we still have an active reading highlight
      if (!currentReadingElementRef.current || !hasCurrentReadingPosition) return

      // Cancel any pending updates
      if (timeoutId) clearTimeout(timeoutId)
      if (rafId) cancelAnimationFrame(rafId)

      // Use both timeout and requestAnimationFrame for reliable updates
      timeoutId = setTimeout(() => {
        reRenderReadingHighlight()
        
        // Also schedule on next frame for extra reliability
        rafId = requestAnimationFrame(() => {
          reRenderReadingHighlight()
          rafId = null
        })
      }, 50) // Shorter delay for reading highlights (they need to be more responsive)
    }

    // Handle window resize
    window.addEventListener('resize', handleLayoutChange)

    // Handle zoom changes using Visual Viewport API (more accurate than resize for zoom)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleLayoutChange)
      window.visualViewport.addEventListener('scroll', handleLayoutChange)
    }

    // Use ResizeObserver to detect any layout changes in the PDF container
    // This catches sidebar changes, zoom, and any other layout shifts
    resizeObserver = new ResizeObserver(() => {
      handleLayoutChange()
    })

    // Observe the PDF container
    const pdfContainer = document.querySelector('.pdf-viewer-container') || 
                         document.querySelector('.pdf-pages-container')
    if (pdfContainer) {
      resizeObserver.observe(pdfContainer)
    }

    // Also observe all text layer containers for changes
    const textLayers = document.querySelectorAll('.textLayer, .text-layer')
    textLayers.forEach(layer => {
      resizeObserver.observe(layer)
    })

    return () => {
      window.removeEventListener('resize', handleLayoutChange)
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleLayoutChange)
        window.visualViewport.removeEventListener('scroll', handleLayoutChange)
      }
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      if (timeoutId) clearTimeout(timeoutId)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [isSidebarCollapsed, sidebarWidth, hasCurrentReadingPosition, pageScale])

  // Update ref when hover state changes
  useEffect(() => {
    hoveredHighlightIdRef.current = hoveredHighlightId
  }, [hoveredHighlightId])

  // Update dot visibility on hover
  useEffect(() => {
    Object.values(highlightLayerRefs.current).forEach(layer => {
      if (!layer) return
      const dots = layer.querySelectorAll('.highlight-connection-dot')
      dots.forEach(dot => {
        const highlightId = dot.dataset.highlightId
        if (hoveredHighlightId === highlightId || (connectingFrom && connectingFrom.highlightId === highlightId)) {
          dot.style.opacity = '1'
        } else {
          dot.style.opacity = '0'
        }
      })
    })
  }, [hoveredHighlightId, connectingFrom])

  // Track mouse position for temporary connection line
  useEffect(() => {
    if (!connectingFrom) {
      setMousePosition(null)
      return
    }

    const handleMouseMove = (e) => {
      // Find which page the mouse is over
      let pageNum = null
      for (const [page, canvas] of Object.entries(canvasRefs.current)) {
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          if (e.clientX >= rect.left && e.clientX <= rect.right &&
              e.clientY >= rect.top && e.clientY <= rect.bottom) {
            pageNum = parseInt(page)
            break
          }
        }
      }

      // Always track mouse position for global overlay, even if not over a canvas
      const pdfContainer = document.querySelector('.pdf-pages-container')
      if (pdfContainer) {
        const containerRect = pdfContainer.getBoundingClientRect()
        const globalX = e.clientX - containerRect.left
        const globalY = e.clientY - containerRect.top
        
        if (pageNum !== null) {
          const canvas = canvasRefs.current[pageNum]
          if (canvas) {
            const rect = canvas.getBoundingClientRect()
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top
            setMousePosition({ 
              x, 
              y, 
              page: pageNum,
              clientX: e.clientX,
              clientY: e.clientY,
              globalX,
              globalY
            })
          } else {
            setMousePosition({ 
              page: null,
              clientX: e.clientX,
              clientY: e.clientY,
              globalX,
              globalY
            })
          }
        } else {
          // Mouse is not over any canvas, but still track global position
          setMousePosition({ 
            page: null,
            clientX: e.clientX,
            clientY: e.clientY,
            globalX,
            globalY
          })
        }
      }
    }

    const handleMouseLeave = (e) => {
      // Check if mouse left the document or any canvas area
      if (!e.relatedTarget || 
          (!e.relatedTarget.closest('.pdf-canvas-wrapper') && 
           !e.relatedTarget.closest('.pdf-page-wrapper'))) {
        // Cancel connection when leaving the page area
        setConnectingFrom(null)
        setMousePosition(null)
        setHoveredHighlightId(null)
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleMouseLeave)
    
    // Also listen for mouse leave on the main container
    const pdfContainer = document.querySelector('.pdf-pages-container')
    if (pdfContainer) {
      pdfContainer.addEventListener('mouseleave', handleMouseLeave)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeave)
      if (pdfContainer) {
        pdfContainer.removeEventListener('mouseleave', handleMouseLeave)
      }
    }
  }, [connectingFrom])

  // Snipping tool functionality
  useEffect(() => {
    if (!isSnippingMode) {
      // Clear snip selection when exiting snipping mode
      setSnipSelection(null)
      snipSelectionRef.current = null
      isSnipDraggingRef.current = false
      setIsSnipDragging(false)
      // Clear all snip layers
      Object.values(snipLayerRefs.current).forEach(layer => {
        if (layer) layer.innerHTML = ''
      })
      return
    }

    const renderSnipSelection = (selection, pageNum) => {
      if (!selection || !pageNum) {
        // Clear all snip layers
        Object.values(snipLayerRefs.current).forEach(layer => {
          if (layer) layer.innerHTML = ''
        })
        return
      }

      const snipLayer = snipLayerRefs.current[pageNum]
      if (!snipLayer) {
        return
      }

      // Clear previous selection
      snipLayer.innerHTML = ''

      const { startX, startY, endX, endY } = selection
      const left = Math.min(startX, endX)
      const top = Math.min(startY, endY)
      const width = Math.abs(endX - startX)
      const height = Math.abs(endY - startY)

      // Only render if there's a meaningful selection
      if (width > 5 && height > 5) {
        const rect = document.createElement('div')
        rect.style.position = 'absolute'
        rect.style.left = left + 'px'
        rect.style.top = top + 'px'
        rect.style.width = width + 'px'
        rect.style.height = height + 'px'
        rect.style.border = '2px dashed #4285f4'
        rect.style.backgroundColor = 'rgba(66, 133, 244, 0.1)'
        rect.style.pointerEvents = 'none'
        rect.style.boxSizing = 'border-box'
        snipLayer.appendChild(rect)
        
      }
    }

    const handleSnipMouseDown = (e) => {
      // Only handle if in snipping mode
      if (!isSnippingMode) {
        console.log('Snip mode not active')
        return
      }

      // Don't handle if clicking on UI elements (buttons, toolbars, etc.)
      if (e.target.closest('.reader-toolbar, .mode-toggle, .btn, button, .sidebar')) {
        console.log('Clicked on UI element, ignoring')
        return
      }

      console.log('Snip mousedown event:', e.target, e.clientX, e.clientY)

      // Find which page we're clicking on by checking all canvases
      let pageNum = null
      let canvas = null
      let canvasRect = null

      for (const [page, canvasRef] of Object.entries(canvasRefs.current)) {
        if (canvasRef) {
          const rect = canvasRef.getBoundingClientRect()
          if (e.clientX >= rect.left && e.clientX <= rect.right &&
              e.clientY >= rect.top && e.clientY <= rect.bottom) {
            pageNum = parseInt(page)
            canvas = canvasRef
            canvasRect = rect
            console.log('Found canvas for page:', pageNum)
            break
          }
        }
      }

      if (!pageNum || !canvas || !canvasRect) {
        console.log('No canvas found at click position')
        return
      }

      // Calculate position relative to canvas
      const startX = e.clientX - canvasRect.left
      const startY = e.clientY - canvasRect.top

      console.log('Starting snip selection:', { startX, startY, page: pageNum })


      // Set refs immediately (synchronous) before state update (asynchronous)
      const selection = {
        startX,
        startY,
        endX: startX,
        endY: startY,
        page: pageNum
      }
      isSnipDraggingRef.current = true
      snipSelectionRef.current = selection
      setIsSnipDragging(true)
      setSnipSelection(selection)


      e.preventDefault()
      e.stopPropagation()
    }

    const handleSnipMouseMove = (e) => {
      
      if (!isSnippingMode) {
        return
      }
      
      if (!isSnipDraggingRef.current) {
        return
      }

      // Use a ref to track current selection to avoid stale closure
      setSnipSelection(prev => {
        
        if (!prev) {
          return prev
        }

        const pageNum = prev.page
        const canvas = canvasRefs.current[pageNum]
        if (!canvas) {
          return prev
        }

        const canvasRect = canvas.getBoundingClientRect()
        const endX = e.clientX - canvasRect.left
        const endY = e.clientY - canvasRect.top

        const updated = {
          ...prev,
          endX,
          endY
        }

        // Update ref synchronously
        snipSelectionRef.current = updated


        // Render selection rectangle with updated values
        renderSnipSelection({
          startX: prev.startX,
          startY: prev.startY,
          endX,
          endY
        }, pageNum)

        return updated
      })
    }

    const handleSnipMouseUp = async (e) => {
      
      if (!isSnippingMode || !isSnipDraggingRef.current) {
        isSnipDraggingRef.current = false
        setIsSnipDragging(false)
        return
      }

      // Get current selection from ref to avoid stale closure
      const currentSelection = snipSelectionRef.current
      

      // Reset dragging state
      isSnipDraggingRef.current = false
      setIsSnipDragging(false)
      
      if (!currentSelection) {
        setSnipSelection(null)
        snipSelectionRef.current = null
        return
      }

      const { startX, startY, endX, endY, page: pageNum } = currentSelection
      const canvas = canvasRefs.current[pageNum]

      if (!canvas) {
        setSnipSelection(null)
        snipSelectionRef.current = null
        return
      }

      const left = Math.min(startX, endX)
      const top = Math.min(startY, endY)
      const width = Math.abs(endX - startX)
      const height = Math.abs(endY - startY)


      // Only capture if selection is meaningful
      if (width > 5 && height > 5) {
        // Capture the snip asynchronously
        (async () => {
          try {

            // Create a temporary canvas to capture the selected area
            const tempCanvas = document.createElement('canvas')
            tempCanvas.width = width
            tempCanvas.height = height
            const tempCtx = tempCanvas.getContext('2d')

            // Draw the selected portion of the PDF canvas to the temp canvas
            tempCtx.drawImage(
              canvas,
              left, top, width, height,  // Source rectangle
              0, 0, width, height         // Destination rectangle
            )

            // Convert to image data URL
            const imageDataUrl = tempCanvas.toDataURL('image/png')


            // Create highlight item ID first (needed for both state updates)
            const highlightItemId = Date.now() + Math.random()
            
            // Add to highlight items - create item inside callback to use correct order
            // Use setHighlightItemsWithSave to ensure Firestore persistence
            setHighlightItemsWithSave(prev => {
              // Create highlight item with correct order from prev state
              const highlightItem = {
                id: highlightItemId,
                text: '', // Empty text for image snips
                color: highlightColor,
                order: prev.length,
                image: imageDataUrl, // Store the image data
                isSnip: true, // Mark as a snip highlight
                page: pageNum,
                snipRect: { left, top, width, height } // Store original position for reference
              }
              
              const newItems = [...prev, highlightItem]
              return newItems
            })

            // Also add to highlights array for consistency
            setHighlights(prev => {
              const newHighlights = [...prev, {
                id: highlightItemId,
                page: pageNum,
                rects: [{
                  x: left,
                  y: top,
                  width: width,
                  height: height
                }],
                text: '',
                color: highlightColor,
                scale: pageScale,
                isSnip: true,
                image: imageDataUrl
              }]
              
              // Update history
              setHighlightHistory(hist => {
                const currentIdx = historyIndexRef.current
                const newHistory = hist.slice(0, currentIdx + 1)
                newHistory.push(newHighlights)
                const newIdx = newHistory.length - 1
                historyIndexRef.current = newIdx
                setHistoryIndex(newIdx)
                return newHistory
              })

              // Auto-save highlights to Firestore immediately (skip during initial load)
              if (!isInitialLoadRef.current) {
                updateDocumentField('highlights', newHighlights).catch(err => {
                  console.error('Failed to save highlights:', err)
                })
              }

              return newHighlights
            })
            
            // Deactivate snip mode after successful capture
            setIsSnippingMode(false)
            
          } catch (error) {
            console.error('Error capturing snip:', error)
            alert('Failed to capture snip. Please try again.')
          }
        })()
      } else {
      }

      // Clear selection
      Object.values(snipLayerRefs.current).forEach(layer => {
        if (layer) layer.innerHTML = ''
      })
      setSnipSelection(null)
      snipSelectionRef.current = null

      e.preventDefault()
      e.stopPropagation()
    }

    // Add event listeners to document level for better coverage
    // Use capture phase to catch events before other handlers
    const handleDocumentMouseDown = (e) => {
      // Only handle if clicking on or near a PDF page
      const pdfContainer = document.querySelector('.pdf-pages-container')
      if (!pdfContainer) return
      
      const containerRect = pdfContainer.getBoundingClientRect()
      if (e.clientX >= containerRect.left && e.clientX <= containerRect.right &&
          e.clientY >= containerRect.top && e.clientY <= containerRect.bottom) {
        handleSnipMouseDown(e)
      }
    }

    // Only add listeners when in snipping mode
    if (isSnippingMode) {
      document.addEventListener('mousedown', handleDocumentMouseDown, true) // Use capture phase
      document.addEventListener('mousemove', handleSnipMouseMove)
      document.addEventListener('mouseup', handleSnipMouseUp)
    } else {
    }

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown, true)
      document.removeEventListener('mousemove', handleSnipMouseMove)
      document.removeEventListener('mouseup', handleSnipMouseUp)
    }
  }, [isSnippingMode, highlightColor, highlightItems.length, pageScale, updateDocumentField, setHighlightItemsWithSave])

  // Render connection lines - only show when hovering/clicking on dots or connected highlights
  useEffect(() => {
    // Clear all connection layers
    Object.values(connectionLayerRefs.current).forEach(layer => {
      if (layer) {
        layer.innerHTML = ''
      }
    })
    
    // Clear global connection overlay
    if (globalConnectionLayerRef.current) {
      globalConnectionLayerRef.current.innerHTML = ''
    }

    // Render temporary connection line if connecting (follows mouse)
    // Use global overlay for continuous line across page boundaries
    if (connectingFrom) {
      const fromHighlight = highlights.find(h => h.id === connectingFrom.highlightId)
      if (!fromHighlight) {
        // If connecting, don't show existing connections, only the temporary line
        return
      }

      const globalLayer = globalConnectionLayerRef.current
      const pdfContainer = document.querySelector('.pdf-pages-container')
      if (!globalLayer || !pdfContainer) {
        return
      }

      const fromPage = fromHighlight.page
      const fromCanvas = canvasRefs.current[fromPage]
      if (!fromCanvas) {
        return
      }

      const containerRect = pdfContainer.getBoundingClientRect()
      const fromCanvasRect = fromCanvas.getBoundingClientRect()
      const fromCanvasWidth = fromCanvas.width
      const fromCanvasHeight = fromCanvas.height
      const fromDisplayedWidth = fromCanvasRect.width
      const fromDisplayedHeight = fromCanvasRect.height
      
      const fromDisplayScaleX = fromDisplayedWidth / fromCanvasWidth
      const fromDisplayScaleY = fromDisplayedHeight / fromCanvasHeight
      const fromScaleRatio = (pageScale / (fromHighlight.scale || pageScale)) * fromDisplayScaleX
      const fromScaleRatioY = (pageScale / (fromHighlight.scale || pageScale)) * fromDisplayScaleY

      const highlightRects = fromHighlight.rects || [{
        x: fromHighlight.x || 0,
        y: fromHighlight.y || 0,
        width: fromHighlight.width || 0,
        height: fromHighlight.height || 0
      }]

      const fromRect = connectingFrom.dot === 'left' ? highlightRects[0] : highlightRects[highlightRects.length - 1]
      const fromXLocal = connectingFrom.dot === 'left' 
        ? fromRect.x * fromScaleRatio
        : (fromRect.x + fromRect.width) * fromScaleRatio
      const fromYLocal = (fromRect.y + fromRect.height / 2) * fromScaleRatioY
      
      // Convert to global coordinates (relative to pdf-pages-container)
      const fromXGlobal = fromCanvasRect.left - containerRect.left + fromXLocal
      const fromYGlobal = fromCanvasRect.top - containerRect.top + fromYLocal

      // Determine target point in global coordinates
      let toXGlobal, toYGlobal
      if (mousePosition && mousePosition.globalX !== undefined && mousePosition.globalY !== undefined) {
        // Use global mouse position for smooth continuous line
        toXGlobal = mousePosition.globalX
        toYGlobal = mousePosition.globalY
      } else {
        // No mouse position yet: use dot position as initial target to avoid straight line
        toXGlobal = fromXGlobal
        toYGlobal = fromYGlobal
      }

      // Create SVG for global overlay
      const containerWidth = containerRect.width
      const containerHeight = containerRect.height
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.style.position = 'absolute'
      svg.style.left = '0'
      svg.style.top = '0'
      svg.style.width = '100%'
      svg.style.height = '100%'
      svg.style.pointerEvents = 'none'
      svg.style.zIndex = '100'
      svg.setAttribute('viewBox', `0 0 ${containerWidth} ${containerHeight}`)
      svg.setAttribute('preserveAspectRatio', 'none')

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      const midX = (fromXGlobal + toXGlobal) / 2
      const pathData = `M ${fromXGlobal} ${fromYGlobal} Q ${midX} ${fromYGlobal} ${midX} ${(fromYGlobal + toYGlobal) / 2} T ${toXGlobal} ${toYGlobal}`
      path.setAttribute('d', pathData)
      path.setAttribute('stroke', getDotColor(fromHighlight.color || 'yellow'))
      path.setAttribute('stroke-width', '2')
      path.setAttribute('fill', 'none')
      path.setAttribute('stroke-dasharray', '5,5')
      path.style.opacity = '0.6'

      svg.appendChild(path)
      globalLayer.appendChild(svg)

      // If connecting, don't show existing connections, only the temporary line
      return
    }

    // Only render existing connections if hovering over a highlight (not when connecting)
    const activeHighlightId = hoveredHighlightId
    if (!activeHighlightId) {
      return // Don't render any connections if not hovering
    }

    // Find all highlights connected to the active highlight
    const activeHighlight = highlights.find(h => h.id === activeHighlightId)
    if (!activeHighlight) {
      return
    }

    // Group connections by page
    const connectionsByPage = new Map()
    
    // Only show connections FROM the active highlight (the specific connections that were created)
    // We don't show connections TO the active highlight because those are already represented
    // in the other highlight's connections array
    if (activeHighlight.connections && activeHighlight.connections.length > 0) {
      activeHighlight.connections.forEach(connection => {
        const targetHighlight = highlights.find(h => h.id === connection.to)
        if (targetHighlight && targetHighlight.page === activeHighlight.page) {
          if (!connectionsByPage.has(activeHighlight.page)) {
            connectionsByPage.set(activeHighlight.page, [])
          }
          // Only add this specific connection - from the exact dot to the exact dot
          connectionsByPage.get(activeHighlight.page).push({
            from: activeHighlight,
            to: targetHighlight,
            connection // This connection has the exact fromDot and toDot that were clicked
          })
        }
      })
    }

    // Render connections for each page
    connectionsByPage.forEach((pageConnections, pageNum) => {
      const connectionLayer = connectionLayerRefs.current[pageNum]
      if (!connectionLayer) return

      // Get canvas for scaling
      const canvas = canvasRefs.current[pageNum]
      if (!canvas) return

      const canvasDims = getCanvasDisplayedDimensions(canvas)
      const canvasWidth = canvas.width
      const canvasHeight = canvas.height
      const displayedWidth = canvasDims.width
      const displayedHeight = canvasDims.height
      
      // Create one SVG per page
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.style.position = 'absolute'
      svg.style.left = '0'
      svg.style.top = '0'
      svg.setAttribute('width', displayedWidth)
      svg.setAttribute('height', displayedHeight)
      svg.style.pointerEvents = 'none'
      svg.style.zIndex = '1'

      pageConnections.forEach(({ from, to, connection }) => {
        const displayScaleX = displayedWidth / canvasWidth
        const displayScaleY = displayedHeight / canvasHeight
        const scaleRatio = (pageScale / (from.scale || pageScale)) * displayScaleX
        const scaleRatioY = (pageScale / (from.scale || pageScale)) * displayScaleY

        // Get rectangles
        const highlightRects = from.rects || [{
          x: from.x || 0,
          y: from.y || 0,
          width: from.width || 0,
          height: from.height || 0
        }]
        const targetRects = to.rects || [{
          x: to.x || 0,
          y: to.y || 0,
          width: to.width || 0,
          height: to.height || 0
        }]

        const fromRect = connection.fromDot === 'left' ? highlightRects[0] : highlightRects[highlightRects.length - 1]
        const toRect = connection.toDot === 'left' ? targetRects[0] : targetRects[targetRects.length - 1]

        const fromX = connection.fromDot === 'left' 
          ? fromRect.x * scaleRatio
          : (fromRect.x + fromRect.width) * scaleRatio
        const fromY = (fromRect.y + fromRect.height / 2) * scaleRatioY

        const toX = connection.toDot === 'left'
          ? toRect.x * scaleRatio
          : (toRect.x + toRect.width) * scaleRatio
        const toY = (toRect.y + toRect.height / 2) * scaleRatioY

        // Create SVG path for curved line
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        const midX = (fromX + toX) / 2
        const pathData = `M ${fromX} ${fromY} Q ${midX} ${fromY} ${midX} ${(fromY + toY) / 2} T ${toX} ${toY}`
        path.setAttribute('d', pathData)
        path.setAttribute('stroke', getDotColor(from.color || 'yellow'))
        path.setAttribute('stroke-width', '2')
        path.setAttribute('fill', 'none')
        path.setAttribute('stroke-dasharray', '5,5')
        path.style.opacity = '0.6'

        svg.appendChild(path)
      })

      if (pageConnections.length > 0) {
        connectionLayer.appendChild(svg)
      }
    })
  }, [highlights, pageData, pageScale, hoveredHighlightId, connectingFrom, mousePosition])

  // Handle color change for highlight
  const handleChangeHighlightColor = (highlightId, newColor) => {
    setHighlights(prev => {
      const updated = prev.map(h => {
        if (h.id === highlightId) {
          return { ...h, color: newColor }
        }
        return h
      })
      // Update history
      setHighlightHistory(hist => {
        const currentIdx = historyIndexRef.current
        const newHistory = hist.slice(0, currentIdx + 1)
        newHistory.push(updated)
        const newIdx = newHistory.length - 1
        historyIndexRef.current = newIdx
        setHistoryIndex(newIdx)
        return newHistory
      })
      
      // Auto-save highlights to Firestore (skip during initial load)
      if (!isInitialLoadRef.current) {
        updateDocumentField('highlights', updated).catch(err => {
          console.error('Failed to save highlights:', err)
        })
      }
      
      return updated
    })
    // Update highlightItems color
    setHighlightItems(prev => {
      const updatedItems = prev.map(item => {
        if (item.id === highlightId) {
          return { ...item, color: newColor }
        }
        return item
      })
      
      // Auto-save highlight items to Firestore
      updateDocumentField('highlightItems', updatedItems).catch(err => {
        console.error('Failed to save highlight items:', err)
      })
      
      return updatedItems
    })
    setShowTooltipFor(null) // Hide tooltip after color change
  }

  // Handle delete highlight
  const handleDeleteHighlight = (highlightId) => {
    setHighlights(prev => {
      const filtered = prev.filter(h => h.id !== highlightId)
      // Update history
      setHighlightHistory(hist => {
        const currentIdx = historyIndexRef.current
        const newHistory = hist.slice(0, currentIdx + 1)
        newHistory.push(filtered)
        const newIdx = newHistory.length - 1
        historyIndexRef.current = newIdx
        setHistoryIndex(newIdx)
        return newHistory
      })
      
      // Auto-save highlights to Firestore (skip during initial load)
      if (!isInitialLoadRef.current) {
        updateDocumentField('highlights', filtered).catch(err => {
          console.error('Failed to save highlights:', err)
        })
      }
      
      return filtered
    })
    // Remove from highlightItems
    setHighlightItems(prev => {
      const filteredItems = prev.filter(item => item.id !== highlightId)
      
      // Auto-save highlight items to Firestore
      updateDocumentField('highlightItems', filteredItems).catch(err => {
        console.error('Failed to save highlight items:', err)
      })
      
      return filteredItems
    })
    setShowTooltipFor(null) // Hide tooltip after delete
    setHoveredHighlightId(null)
  }

  // Render tooltip for PDF highlights
  useEffect(() => {
    // Clear all tooltip layers
    Object.values(tooltipLayerRefs.current).forEach(layer => {
      if (layer) {
        layer.innerHTML = ''
      }
    })

    if (!showTooltipFor || !showTooltipFor.page) return

    const tooltipLayer = tooltipLayerRefs.current[showTooltipFor.page]
    if (!tooltipLayer) return

    const highlight = highlights.find(h => h.id === showTooltipFor.highlightId)
    if (!highlight) return

    // Create tooltip
    const tooltip = document.createElement('div')
    tooltip.className = 'highlight-tooltip'
    tooltip.style.position = 'absolute'
    tooltip.style.left = showTooltipFor.x + 'px'
    tooltip.style.top = showTooltipFor.y + 'px'
    tooltip.style.transform = 'translate(-50%, -100%)'
    tooltip.style.zIndex = '20'
    tooltip.style.pointerEvents = 'auto'
    
    // Color options
    const colorOptions = document.createElement('div')
    colorOptions.className = 'tooltip-color-options'
    
    const colors = ['yellow', 'green', 'blue']
    colors.forEach(color => {
      const colorBtn = document.createElement('button')
      colorBtn.className = `tooltip-color-btn ${highlight.color === color ? 'active' : ''}`
      colorBtn.style.backgroundColor = color === 'yellow' ? 'rgba(251, 188, 4, 1)' : 
                                       color === 'green' ? 'rgba(52, 168, 83, 1)' : 
                                       'rgba(66, 133, 244, 1)'
      colorBtn.style.width = '11.23px'
      colorBtn.style.height = '11.23px'
      colorBtn.style.borderRadius = '50%'
      colorBtn.style.border = highlight.color === color ? '0.94px solid #000' : '0.94px solid transparent'
      colorBtn.style.cursor = 'pointer'
      colorBtn.style.margin = '0 1.87px'
      colorBtn.title = color
      colorBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        handleChangeHighlightColor(highlight.id, color)
      })
      colorOptions.appendChild(colorBtn)
    })
    
    // Delete button - black circle with white X
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'tooltip-delete-btn'
    deleteBtn.innerHTML = '' // X is added via CSS ::before
    deleteBtn.style.cursor = 'pointer'
    deleteBtn.style.marginLeft = '3.74px'
    deleteBtn.title = 'Delete highlight'
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      handleDeleteHighlight(highlight.id)
    })
    
    tooltip.appendChild(colorOptions)
    tooltip.appendChild(deleteBtn)
    tooltipLayer.appendChild(tooltip)
    
    // Keep tooltip visible when hovering over it
    tooltip.addEventListener('mouseenter', () => {
      isHoveringTooltipRef.current = true
      setShowTooltipFor(showTooltipFor)
    })
    
    tooltip.addEventListener('mouseleave', () => {
      isHoveringTooltipRef.current = false
      setTimeout(() => {
        if (hoveredHighlightIdRef.current !== highlight.id && !isHoveringTooltipRef.current) {
          setShowTooltipFor(null)
        }
      }, 200)
    })
  }, [showTooltipFor, highlights])

  // Sync highlight items with highlights (for undo/redo)
  // Function to merge connected highlights of the same color
  const mergeConnectedHighlights = useCallback((highlights) => {
    if (!highlights || highlights.length === 0) return []
    
    // Build connection graph
    const connections = new Map()
    highlights.forEach(h => {
      if (!connections.has(h.id)) {
        connections.set(h.id, new Set())
      }
      if (h.connections) {
        h.connections.forEach(conn => {
          connections.get(h.id).add(conn.to)
          if (!connections.has(conn.to)) {
            connections.set(conn.to, new Set())
          }
          connections.get(conn.to).add(h.id)
        })
      }
    })
    
    // Find connected components (groups of connected highlights)
    const visited = new Set()
    const groups = []
    
    const findConnectedGroup = (startId, group) => {
      if (visited.has(startId)) return
      visited.add(startId)
      group.add(startId)
      
      const connected = connections.get(startId) || new Set()
      connected.forEach(connectedId => {
        const highlight = highlights.find(h => h.id === connectedId)
        const startHighlight = highlights.find(h => h.id === startId)
        // Only connect if same color
        if (highlight && startHighlight && highlight.color === startHighlight.color) {
          findConnectedGroup(connectedId, group)
        }
      })
    }
    
    highlights.forEach(highlight => {
      if (!visited.has(highlight.id)) {
        const group = new Set()
        findConnectedGroup(highlight.id, group)
        if (group.size > 0) {
          groups.push(Array.from(group))
        }
      }
    })
    
    // Create merged items
    const mergedItems = []
    const processedIds = new Set()
    
    groups.forEach(group => {
      if (group.length > 1) {
        // Merge connected highlights
        const groupHighlights = group.map(id => highlights.find(h => h.id === id)).filter(Boolean)
        const sortedGroup = groupHighlights.sort((a, b) => {
          // Sort by page, then by column index (if available), then by Y position
          if (a.page !== b.page) return a.page - b.page
          
          // If both have column indices, sort by column first
          const aHasColumn = a.columnIndex !== null && a.columnIndex !== undefined
          const bHasColumn = b.columnIndex !== null && b.columnIndex !== undefined
          
          if (aHasColumn && bHasColumn) {
            // Both have column indices - sort by column, then Y
            if (a.columnIndex !== b.columnIndex) {
              return a.columnIndex - b.columnIndex
            }
          } else if (aHasColumn || bHasColumn) {
            // One has column index, one doesn't - sort by Y position (treat as same column)
            // This handles mixed column/non-column PDFs
          }
          // If neither has column index, or both have same column, sort by Y position
          
          const aY = (a.rects && a.rects[0]?.y) || a.y || 0
          const bY = (b.rects && b.rects[0]?.y) || b.y || 0
          return aY - bY
        })
        
        const mergedText = sortedGroup.map(h => h.text).filter(Boolean).join(' ')
        const firstHighlight = sortedGroup[0]
        
        mergedItems.push({
          id: firstHighlight.id, // Use first highlight's ID
          text: mergedText,
          color: firstHighlight.color || 'yellow',
          order: mergedItems.length,
          isMerged: true,
          mergedIds: group
        })
        
        group.forEach(id => processedIds.add(id))
      }
    })
    
    // Add unconnected highlights
    highlights.forEach(highlight => {
      if (!processedIds.has(highlight.id)) {
        mergedItems.push({
          id: highlight.id,
          text: highlight.text || '',
          color: highlight.color || 'yellow',
          order: mergedItems.length,
          isMerged: false
        })
      }
    })
    
    return mergedItems.sort((a, b) => {
      const aHighlight = highlights.find(h => h.id === a.id)
      const bHighlight = highlights.find(h => h.id === b.id)
      if (!aHighlight || !bHighlight) return 0
      
      // Sort by page first
      if (aHighlight.page !== bHighlight.page) {
        return aHighlight.page - bHighlight.page
      }
      
      // Then by column index (if available), then by Y position
      const aHasColumn = aHighlight.columnIndex !== null && aHighlight.columnIndex !== undefined
      const bHasColumn = bHighlight.columnIndex !== null && bHighlight.columnIndex !== undefined
      
      if (aHasColumn && bHasColumn) {
        // Both have column indices - sort by column, then Y
        if (aHighlight.columnIndex !== bHighlight.columnIndex) {
          return aHighlight.columnIndex - bHighlight.columnIndex
        }
      } else if (aHasColumn || bHasColumn) {
        // One has column index, one doesn't - sort by Y position (treat as same column)
        // This handles mixed column/non-column PDFs
      }
      // If neither has column index, or both have same column, sort by Y position
      
      const aY = (aHighlight.rects && aHighlight.rects[0]?.y) || aHighlight.y || 0
      const bY = (bHighlight.rects && bHighlight.rects[0]?.y) || bHighlight.y || 0
      return aY - bY
    }).map((item, index) => ({ ...item, order: index }))
  }, [])

  // Sync highlight items with highlights (for undo/redo)
  useEffect(() => {
    // Skip if we're in the middle of a drag operation (prevents interference with drag-drop)
    if (isDraggingHighlightRef.current) {
      return
    }
    
    // Skip if highlightItems already exist and highlights haven't changed
    // This prevents overwriting user's custom order when only highlights are loaded
    // Only skip on initial load - after that, we need to sync for new highlights
    if (highlightItems.length > 0 && highlights.length === highlightItems.length && isInitialLoadRef.current) {
      const highlightIds = new Set(highlights.map(h => h.id))
      const itemIds = new Set(highlightItems.map(item => item.id))
      const idsMatch = highlightIds.size === itemIds.size && 
                       Array.from(highlightIds).every(id => itemIds.has(id))
      if (idsMatch) {
        return
      }
    }
    
    // Create merged items from connected highlights
    const mergedItems = mergeConnectedHighlights(highlights)
    
    // Update highlightItems
    setHighlightItems(prev => {
      // Create a map of merged item IDs to track which highlights are merged
      const mergedIdsMap = new Map()
      mergedItems.forEach(mergedItem => {
        if (mergedItem.isMerged && mergedItem.mergedIds) {
          mergedItem.mergedIds.forEach(id => {
            mergedIdsMap.set(id, mergedItem.id)
          })
        }
      })
      
      // Update existing items with new text/color, add new ones
      // IMPORTANT: Preserve user's custom order from prev for existing items
      // Only use mergedItem.order for truly new items that don't exist in prev
      const updated = mergedItems.map(mergedItem => {
        // First, check if the merged item's ID itself exists in previous items
        // (This handles the case where the merged item uses the first highlight's ID)
        const existingByMergedId = prev.find(item => item.id === mergedItem.id)
        if (existingByMergedId) {
          // For merged items, we need to append text from other merged highlights
          if (mergedItem.isMerged && mergedItem.mergedIds) {
            // Find all existing items for the merged IDs, preserving order based on mergedIds
            const existingItems = mergedItem.mergedIds
              .map(id => prev.find(item => item.id === id))
              .filter(Boolean)
            // If we have multiple existing items, merge their text
            if (existingItems.length > 1) {
              // Combine text from all existing items in the order they appear in mergedIds
              // This ensures the first highlight's text comes first, then the second, etc.
              const combinedText = existingItems.map(item => item.text).filter(Boolean).join(' ')
              // Preserve order from existing item (user's custom order)
              if (existingByMergedId.isSnip) {
                return { ...mergedItem, ...existingByMergedId, text: combinedText, order: existingByMergedId.order }
              }
              return { ...mergedItem, text: combinedText, order: existingByMergedId.order }
            }
          }
          // Preserve both text and order from existing item (user's manual edits and custom order)
          // For snip items, preserve all properties (isSnip, image, etc.)
          if (existingByMergedId.isSnip) {
            return { ...mergedItem, ...existingByMergedId, order: existingByMergedId.order }
          }
          return { ...mergedItem, text: existingByMergedId.text, order: existingByMergedId.order }
        }
        
        // For merged items, check if any of the merged highlight IDs have existing items
        if (mergedItem.isMerged && mergedItem.mergedIds) {
          // Find existing items for any of the merged IDs, preserving order based on mergedIds
          const existingItems = mergedItem.mergedIds
            .map(id => prev.find(item => item.id === id))
            .filter(Boolean)
          
          if (existingItems.length > 0) {
            // If we have multiple existing items, merge their text in the order of mergedIds
            if (existingItems.length > 1) {
              // Combine text from all existing items in the order they appear in mergedIds
              // This ensures the first highlight's text comes first, then the second, etc.
              const combinedText = existingItems.map(item => item.text).filter(Boolean).join(' ')
              // Use the order from the first existing item (preserve user's custom order)
              return { ...mergedItem, text: combinedText, order: existingItems[0].order }
            }
            // Single existing item - preserve both text and order
            // For snip items, preserve all properties (isSnip, image, etc.)
            const existingItem = existingItems[0]
            if (existingItem.isSnip) {
              return { ...mergedItem, ...existingItem, order: existingItem.order }
            }
            const existingText = existingItem.text
            return { ...mergedItem, text: existingText, order: existingItem.order }
          }
        } else {
          // For non-merged items, preserve existing text and order
          const existing = prev.find(item => item.id === mergedItem.id)
          if (existing) {
            // Preserve all properties from existing item (especially isSnip and image for snip highlights)
            if (existing.isSnip) {
              return { ...mergedItem, ...existing, order: existing.order }
            }
            return { ...mergedItem, text: existing.text, order: existing.order }
          }
        }
        // For new items, use the sorted order from mergeConnectedHighlights (already set)
        return mergedItem
      })
      
      // Remove items that no longer exist as separate items (they're now merged)
      const highlightIds = new Set(highlights.map(h => h.id))
      const mergedItemIds = new Set(mergedItems.map(item => item.id))
      
      const filtered = updated.filter(item => {
        if (item.isMerged && item.mergedIds) {
          // Keep merged items if any of their merged IDs exist in highlights
          return item.mergedIds.some(id => highlightIds.has(id))
        }
        // For non-merged items, check if the ID exists in highlights
        // and is not part of a merged group (i.e., its ID matches the merged item's ID)
        if (highlightIds.has(item.id)) {
          // If this highlight is part of a merged group, only keep it if it's the merged item itself
          if (mergedIdsMap.has(item.id)) {
            const mergedItemId = mergedIdsMap.get(item.id)
            return mergedItemId === item.id && mergedItemIds.has(item.id)
          }
          // Not part of a merged group, keep it
          return true
        }
        return false
      })
      
      // Sort by order to maintain user's custom order
      const finalItems = filtered.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      
      // Early return if nothing actually changed (same items, same order, same text, same color)
      // This prevents unnecessary re-renders that cause "vibrating" during drag operations
      if (prev.length === finalItems.length) {
        const prevMap = new Map(prev.map(item => [item.id, item]))
        const hasChanges = finalItems.some(item => {
          const prevItem = prevMap.get(item.id)
          if (!prevItem) return true
          // For snip items, also check image property
          if (item.isSnip || prevItem.isSnip) {
            return prevItem.order !== item.order || 
                   prevItem.text !== item.text || 
                   prevItem.color !== item.color ||
                   prevItem.inline !== item.inline ||
                   prevItem.isSnip !== item.isSnip ||
                   prevItem.image !== item.image
          }
          return prevItem.order !== item.order || 
                 prevItem.text !== item.text || 
                 prevItem.color !== item.color ||
                 prevItem.inline !== item.inline
        })
        if (!hasChanges) {
          return prev
        }
      }
      
      // Preserve snip items that might not be in mergedItems (they come from highlights but mergeConnectedHighlights might not handle them)
      const snipItemsFromPrev = prev.filter(item => item.isSnip && !finalItems.find(fi => fi.id === item.id))
      if (snipItemsFromPrev.length > 0) {
        return [...finalItems, ...snipItemsFromPrev].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      }
      
      return finalItems
    })
  }, [highlights, mergeConnectedHighlights])

  // Helper function to get highlight color
  const getHighlightColor = (color) => {
    const colors = {
      yellow: 'rgba(251, 188, 4, 0.21)', // Reduced opacity for better appearance
      green: 'rgba(52, 168, 83, 0.21)', // Reduced opacity for better appearance
      blue: 'rgba(66, 133, 244, 0.21)' // Reduced opacity for better appearance
    }
    return colors[color] || colors.yellow
  }

  // Update all existing highlight colors to ensure they use the latest values
  // This ensures highlights maintain their correct colors after re-renders
  useEffect(() => {
    Object.values(highlightLayerRefs.current).forEach(layer => {
      if (layer) {
        const highlightRects = layer.querySelectorAll('.highlight-rect')
        highlightRects.forEach(rect => {
          // Get the highlight ID from the rect and find the corresponding highlight
          const highlightId = rect.dataset.highlightId
          if (highlightId) {
            const highlight = highlights.find(h => h.id === highlightId)
            if (highlight) {
              // Use the correct color for this highlight instead of hardcoded yellow
              const highlightBgColor = getHighlightColor(highlight.color || 'yellow')
              rect.style.backgroundColor = highlightBgColor
            }
          }
        })
      }
    })
  }, [renderedPages, highlights])

  // Ensure highlights are always visible regardless of text layer visibility
  useEffect(() => {
    Object.values(highlightLayerRefs.current).forEach(layer => {
      if (layer) {
        // Ensure highlight layer itself is visible
        layer.style.opacity = '1'
        // Ensure all highlight rects are visible
        const highlightRects = layer.querySelectorAll('.highlight-rect')
        highlightRects.forEach(rect => {
          rect.style.opacity = '1'
        })
      }
    })
  }, [textLayerVisible, highlights])

  // Toggle text layer visibility by updating span colors and ensure click handlers work
  useEffect(() => {
    Object.values(textLayerRefs.current).forEach((textLayer, pageIndex) => {
      if (textLayer) {
        const spans = textLayer.querySelectorAll('span')
        spans.forEach(span => {
          if (textLayerVisible) {
            // Show text by removing transparent color (let CSS handle it, or set to black)
            span.style.color = ''
            span.style.setProperty('color', 'black', 'important')
          } else {
            // Hide text by making it transparent
            span.style.setProperty('color', 'transparent', 'important')
          }
          // Ensure pointer events are enabled for clicks (especially important when text is visible)
          span.style.pointerEvents = 'auto'
          // Set cursor based on interaction mode (use !important to override CSS)
          if (interactionMode === 'read') {
            span.style.setProperty('cursor', 'pointer', 'important')
          } else {
            span.style.setProperty('cursor', 'text', 'important')
          }
        })
        
        // Add a delegated click handler on the text layer itself to catch all clicks
        // This ensures clicks work even if individual span handlers are missing
        const handleTextLayerClick = (e) => {
          // Only handle if clicking directly on a span
          const clickedSpan = e.target.closest('span')
          if (!clickedSpan || clickedSpan.closest('.textLayer') !== textLayer) return
          
          // Check current interactionMode from ref, not captured value
          if (interactionModeRef.current === 'read') {
            // Get charIndex from data attribute (more reliable than element reference)
            let charIndexAttr = clickedSpan.dataset.charIndex
            let charIndex = charIndexAttr ? parseInt(charIndexAttr, 10) : null
            
            // Fallback: if data attribute is missing, use span position relative to other spans
            if ((charIndex === null || isNaN(charIndex)) && extractedText) {
              const spanText = clickedSpan.textContent || ''
              const textItems = textItemsRef.current.length > 0 ? textItemsRef.current : []
              
              // Try to find a textItem whose element matches this span
              const matchingItem = textItems.find(item => item.element === clickedSpan)
              if (matchingItem && matchingItem.charIndex >= 0) {
                charIndex = matchingItem.charIndex
                clickedSpan.dataset.charIndex = charIndex.toString()
              } else {
                // Fallback: use span's position relative to other spans on the same page
                // Get all spans on the same page and find this span's index
                const textLayer = clickedSpan.closest('.textLayer')
                if (textLayer) {
                  const allSpansOnPage = Array.from(textLayer.querySelectorAll('span'))
                  const spanIndex = allSpansOnPage.indexOf(clickedSpan)
                  
                  if (spanIndex >= 0) {
                    // Strategy: Find spans with known charIndex before and after this span
                    // Use them to estimate this span's charIndex
                    let prevCharIndex = null
                    let nextCharIndex = null
                    
                    // Look backwards for a span with charIndex (find the closest one)
                    for (let i = spanIndex - 1; i >= 0 && i >= spanIndex - 50; i--) {
                      const prevSpan = allSpansOnPage[i]
                      // Check both data attribute and textItems
                      let prevCharIndexValue = null
                      const prevCharIndexAttr = prevSpan.dataset.charIndex
                      if (prevCharIndexAttr) {
                        prevCharIndexValue = parseInt(prevCharIndexAttr, 10)
                      } else {
                        // Try textItems
                        const prevItem = textItems.find(item => item.element === prevSpan)
                        if (prevItem && prevItem.charIndex >= 0) {
                          prevCharIndexValue = prevItem.charIndex + (prevItem.str?.length || 0)
                        }
                      }
                      
                      if (prevCharIndexValue !== null && prevCharIndexValue >= 0) {
                        prevCharIndex = prevCharIndexValue
                        // Add the length of all spans between prevSpan and clickedSpan
                        let totalLength = 0
                        for (let j = i + 1; j < spanIndex; j++) {
                          totalLength += (allSpansOnPage[j].textContent || '').length
                        }
                        charIndex = prevCharIndex + totalLength
                        clickedSpan.dataset.charIndex = charIndex.toString()
                        break
                      }
                    }
                    
                    // If we still don't have charIndex, look forward
                    if (charIndex === null || isNaN(charIndex)) {
                      for (let i = spanIndex + 1; i < allSpansOnPage.length && i <= spanIndex + 50; i++) {
                        const nextSpan = allSpansOnPage[i]
                        // Check both data attribute and textItems
                        let nextCharIndexValue = null
                        const nextCharIndexAttr = nextSpan.dataset.charIndex
                        if (nextCharIndexAttr) {
                          nextCharIndexValue = parseInt(nextCharIndexAttr, 10)
                        } else {
                          // Try textItems
                          const nextItem = textItems.find(item => item.element === nextSpan)
                          if (nextItem && nextItem.charIndex >= 0) {
                            nextCharIndexValue = nextItem.charIndex
                          }
                        }
                        
                        if (nextCharIndexValue !== null && nextCharIndexValue >= 0) {
                          nextCharIndex = nextCharIndexValue
                          // Subtract the length of all spans between clickedSpan and nextSpan
                          let totalLength = 0
                          for (let j = spanIndex + 1; j < i; j++) {
                            totalLength += (allSpansOnPage[j].textContent || '').length
                          }
                          charIndex = nextCharIndex - totalLength - spanText.length
                          if (charIndex >= 0) {
                            clickedSpan.dataset.charIndex = charIndex.toString()
                          } else {
                            charIndex = null
                          }
                          break
                        }
                      }
                    }
                    
                    // Last resort: search extractedText directly for the span's text
                    if ((charIndex === null || isNaN(charIndex)) && extractedText) {
                      
                      // Try to find the span's text in extractedText
                      // First, try exact match of the span text
                      const normalizedSpanText = spanText.trim()
                      if (normalizedSpanText.length > 0) {
                        // Try to find a unique occurrence by searching from different positions
                        // Start from a reasonable position based on page number
                        const pageNumAttr = textLayer.dataset.page
                        let searchStart = 0
                        
                        if (pageNumAttr && totalPages > 0) {
                          // Estimate page start: assume average page length
                          const estimatedPageLength = extractedText.length / totalPages
                          searchStart = Math.max(0, (parseInt(pageNumAttr, 10) - 1) * estimatedPageLength)
                        }
                        
                        // Search for the span text, starting from estimated page position
                        let foundIndex = extractedText.indexOf(normalizedSpanText, searchStart)
                        
                        // If not found, try searching from the beginning
                        if (foundIndex < 0) {
                          foundIndex = extractedText.indexOf(normalizedSpanText, 0)
                        }
                        
                        // If still not found, try searching for the first word
                        if (foundIndex < 0) {
                          const words = normalizedSpanText.split(/\s+/).filter(w => w.length > 0)
                          if (words.length > 0) {
                            const firstWord = words[0]
                            foundIndex = extractedText.indexOf(firstWord, searchStart)
                            if (foundIndex < 0) {
                              foundIndex = extractedText.indexOf(firstWord, 0)
                            }
                          }
                        }
                        
                        if (foundIndex >= 0) {
                          charIndex = foundIndex
                          clickedSpan.dataset.charIndex = charIndex.toString()
                        }
                      }
                    }
                  }
                }
              }
            }
            
            if (charIndex !== null && charIndex >= 0 && extractedText && charIndex < extractedText.length) {
              e.preventDefault()
              e.stopPropagation()
              
              // Get exact click position within the span for more precise word detection
              const exactCharIndex = getExactCharIndexFromClick(e, clickedSpan, charIndex)
              
              // Find the word at this exact charIndex
              const wordStart = findWordStart(extractedText, exactCharIndex)
              // Extract word by finding the end (next whitespace or end of text)
              let wordEnd = wordStart
              while (wordEnd < extractedText.length && /\S/.test(extractedText[wordEnd])) {
                wordEnd++
              }
              const word = extractedText.substring(wordStart, wordEnd)
              
              if (word && /\S/.test(word)) {
                handleWordClick(wordStart, word, clickedSpan)
              } else {
                // If clicked on whitespace, find next word
                const nextWordStart = findWordStart(extractedText, charIndex + 1)
                let nextWordEnd = nextWordStart
                while (nextWordEnd < extractedText.length && /\S/.test(extractedText[nextWordEnd])) {
                  nextWordEnd++
                }
                const nextWord = extractedText.substring(nextWordStart, nextWordEnd)
                if (nextWord) {
                  handleWordClick(nextWordStart, nextWord, clickedSpan)
                }
              }
            } else {
            }
          }
        }
        
        // Remove old handler if it exists
        if (textLayer.dataset.hasClickHandler) {
          textLayer.removeEventListener('click', textLayer._clickHandler)
        }
        
        // Add new handler
        textLayer._clickHandler = handleTextLayerClick
        textLayer.addEventListener('click', handleTextLayerClick, { capture: true })
        textLayer.dataset.hasClickHandler = 'true'
      }
    })
  }, [textLayerVisible, renderedPages, interactionMode])

  // Undo/redo functions for highlights
  const handleUndoHighlight = useCallback(() => {
    // Get the current history and index from refs (most up-to-date values)
    const currentHistory = highlightHistoryRef.current
    const currentIdx = historyIndexRef.current
    
    if (currentIdx <= 0 || !currentHistory || currentHistory.length === 0) {
      return
    }
    
    const newIndex = currentIdx - 1
    const newHighlights = currentHistory[newIndex] || []
    
    // Update ref first
    historyIndexRef.current = newIndex
    
    // Update both states directly - React will batch these
    // This avoids the issue of nested setState callbacks causing multiple invocations
    setHistoryIndex(newIndex)
    setHighlights([...newHighlights])
    
    // History ref is already up-to-date (we're reading from it, not modifying it)
  }, [])

  const handleRedoHighlight = useCallback(() => {
    setHighlightHistory(hist => {
      // Always read from ref to get the most current value
      const currentIdx = historyIndexRef.current
      if (currentIdx < hist.length - 1) {
        const newIndex = currentIdx + 1
        historyIndexRef.current = newIndex
        setHistoryIndex(newIndex)
        const newHighlights = hist[newIndex] || []
        setHighlights([...newHighlights])
      }
      return hist
    })
  }, [])

  // Update refs when state changes
  useEffect(() => {
    historyIndexRef.current = historyIndex
    highlightHistoryRef.current = highlightHistory
    highlightsRef.current = highlights
  }, [historyIndex, highlightHistory, highlights])

  // Keyboard handler for undo/redo (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Don't handle if typing in an input field
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') return
      
      // Ctrl+Z or Cmd+Z for undo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        handleUndoHighlight()
      }
      // Ctrl+Shift+Z or Ctrl+Y or Cmd+Shift+Z for redo
      else if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault()
        handleRedoHighlight()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleUndoHighlight, handleRedoHighlight])

  // Helper function to get darker border color for hover
  const getHighlightBorderColor = (color) => {
    const colors = {
      yellow: 'rgba(251, 188, 4, 0.8)',
      green: 'rgba(52, 168, 83, 0.8)',
      blue: 'rgba(66, 133, 244, 0.8)'
    }
    return colors[color] || colors.yellow
  }

  // Helper function to get dot color
  const getDotColor = (color) => {
    const colors = {
      yellow: 'rgba(251, 188, 4, 1)',
      green: 'rgba(52, 168, 83, 1)',
      blue: 'rgba(66, 133, 244, 1)'
    }
    return colors[color] || colors.yellow
  }

  const renderHighlight = (highlight, highlightLayer) => {
    // Ensure highlight layer is always visible
    if (highlightLayer) {
      highlightLayer.style.opacity = '1'
    }
    
    const highlightBgColor = getHighlightColor(highlight.color || 'yellow')
    const borderColor = getHighlightBorderColor(highlight.color || 'yellow')
    const dotColor = getDotColor(highlight.color || 'yellow')
    
    // Remove existing highlights and dots for this highlight to re-render fresh
    // Query for all elements with this highlight ID (includes both rects and dots)
    const existingHighlights = highlightLayer.querySelectorAll(`[data-highlight-id="${highlight.id}"]`)
    // Remove all found elements immediately
    existingHighlights.forEach(el => {
      if (el.parentNode === highlightLayer) {
        el.remove()
      }
    })
    // Double-check: query again after removal to catch any elements that might have been
    // added by a concurrent render call. This prevents duplicate layers when multiple
    // effects trigger renderHighlight simultaneously.
    const remainingHighlights = highlightLayer.querySelectorAll(`[data-highlight-id="${highlight.id}"]`)
    remainingHighlights.forEach(el => {
      if (el.parentNode === highlightLayer) {
        el.remove()
      }
    })

    // Get current page info to adjust coordinates if scale changed
    const pageInfo = pageData.find(p => p.pageNum === highlight.page)
    if (!pageInfo) return

    // Get canvas and text layer to calculate scaling
    const canvas = canvasRefs.current[highlight.page]
    if (!canvas) return

    const textLayer = textLayerRefs.current[highlight.page]
    if (!textLayer) return

    // Get canvas displayed dimensions (text layer matches canvas displayed size)
    // Use helper function for consistency - ensures alignment even when canvas exceeds container
    const canvasDims = getCanvasDisplayedDimensions(canvas)
    const currentCanvasDisplayedWidth = canvasDims.width
    const currentCanvasDisplayedHeight = canvasDims.height
    
    // Ensure highlight layer has dimensions set (critical for visibility)
    if (highlightLayer) {
      if (!highlightLayer.style.width || highlightLayer.style.width === '0px' || highlightLayer.style.width === '') {
        highlightLayer.style.width = currentCanvasDisplayedWidth + 'px'
      }
      if (!highlightLayer.style.height || highlightLayer.style.height === '0px' || highlightLayer.style.height === '') {
        highlightLayer.style.height = currentCanvasDisplayedHeight + 'px'
      }
    }

    // Get text layer dimensions at creation time (stored with highlight)
    // If not stored (old highlights), estimate from current dimensions
    let creationTextLayerWidth = highlight.textLayerWidth
    let creationTextLayerHeight = highlight.textLayerHeight

    if (!creationTextLayerWidth || !creationTextLayerHeight) {
      // Fallback for old highlights: use current canvas displayed dimensions
      // This works if the scale hasn't changed and viewport hasn't changed
      creationTextLayerWidth = currentCanvasDisplayedWidth
      creationTextLayerHeight = currentCanvasDisplayedHeight
    }

    // Scale highlights based on canvas displayed size ratio
    // Highlights are stored relative to text layer at creation time
    // Text layer matches canvas displayed size, so we can use canvas dimensions directly
    // When viewport changes, canvas displayed size changes immediately, so highlights scale proportionally
    const scaleRatio = currentCanvasDisplayedWidth / creationTextLayerWidth
    const scaleRatioY = currentCanvasDisplayedHeight / creationTextLayerHeight
    
    // Support both old format (single rect) and new format (array of rects)
    const rects = highlight.rects || [{
      x: highlight.x || 0,
      y: highlight.y || 0,
      width: highlight.width || 0,
      height: highlight.height || 0
    }]
    
    // Find the first and last rectangles for connection dots
    const firstRect = rects[0]
    const lastRect = rects[rects.length - 1]
    
    // Render each rectangle separately
    rects.forEach((rect, index) => {
      const x = rect.x * scaleRatio
      const y = rect.y * scaleRatioY
      const width = rect.width * scaleRatio
      // Height calculation: scale the stored height, then add padding for better alignment
      // The stored height is the font size, but we need more to cover descenders and line spacing
      // Use a percentage-based padding that scales with font size (larger fonts need more padding)
      // For snip highlights, use exact height without padding
      const baseHeight = rect.height * scaleRatioY
      let height
      if (highlight.isSnip) {
        // For snip highlights, use exact height without padding to match the selected area
        height = baseHeight
      } else {
        // Add 15-20% padding, with a minimum of 0.15 for small fonts and scaling for larger fonts
        const paddingRatio = Math.max(0.15, Math.min(0.20, 0.15 + (baseHeight / 100) * 0.05))
        height = baseHeight * (1 + paddingRatio)
      }

      const div = document.createElement('div')
      div.className = 'highlight-rect'
      div.dataset.highlightId = highlight.id
      div.dataset.rectIndex = index
      div.style.position = 'absolute'
      div.style.left = x + 'px'
      div.style.top = y + 'px' // Top position stays the same
      div.style.width = width + 'px'
      div.style.height = height + 'px'
      div.style.backgroundColor = highlightBgColor
      // Ensure highlight is always visible regardless of text layer opacity
      div.style.opacity = '1'
      // In read mode, allow clicks to pass through to text spans below
      // In highlight mode, enable pointer events for hover interactions
      div.style.pointerEvents = interactionMode === 'read' ? 'none' : 'auto'
      div.style.zIndex = '10' // Higher z-index to be above text spans
      div.style.cursor = 'default'
      div.style.transition = 'border-color 0.2s ease'
      div.style.visibility = 'visible'
      div.style.display = 'block'
      // Force the highlight to be visible even when text layer is invisible
      div.style.mixBlendMode = 'normal'
      div.style.willChange = 'opacity, transform'
      
      // Ensure highlight layer is visible before appending
      if (highlightLayer) {
        highlightLayer.style.opacity = '1'
        highlightLayer.style.visibility = 'visible'
      }
      
      // Add hover effect (only in highlight mode)
      if (interactionMode === 'highlight') {
        const handleMouseEnter = (e) => {
          e.stopPropagation()
          // Don't show hover if we just completed a connection (give it a moment to clear)
          setHoveredHighlightId(highlight.id)
          div.style.border = `2px solid ${borderColor}`
          div.style.borderRadius = '2px'
          // Also show dots immediately
          const dots = highlightLayer.querySelectorAll(`[data-highlight-id="${highlight.id}"][data-dot]`)
          dots.forEach(dot => {
            dot.style.opacity = '1'
          })
          
          // Show tooltip (only if not connecting)
          if (!connectingFrom) {
            const rect = div.getBoundingClientRect()
            const canvas = canvasRefs.current[highlight.page]
            if (canvas) {
              const canvasRect = canvas.getBoundingClientRect()
              const tooltipX = rect.left - canvasRect.left + rect.width / 2
              const tooltipY = rect.top - canvasRect.top - 0 // Position above the highlight (25% closer)
              setShowTooltipFor({ highlightId: highlight.id, x: tooltipX, y: tooltipY, page: highlight.page })
            }
          }
        }
        
        div.addEventListener('mouseenter', handleMouseEnter)
        div.addEventListener('mouseover', handleMouseEnter) // Also listen to mouseover
        
        div.addEventListener('mouseleave', (e) => {
          e.stopPropagation()
          // Use setTimeout to allow dot hover and tooltip hover to work
          setTimeout(() => {
            if (hoveredHighlightIdRef.current === highlight.id && !isHoveringTooltipRef.current) {
              setHoveredHighlightId(null)
              setShowTooltipFor(null) // Hide tooltip
              const dots = highlightLayer.querySelectorAll(`[data-highlight-id="${highlight.id}"][data-dot]`)
              dots.forEach(dot => {
                // Only hide if not hovering over the dot itself
                if (!dot.matches(':hover')) {
                  dot.style.opacity = '0'
                }
              })
            }
          }, 200)
          div.style.border = 'none'
        })
      }
      
      // Ensure highlight layer is visible before appending
      if (highlightLayer) {
        highlightLayer.style.opacity = '1'
        highlightLayer.style.visibility = 'visible'
        highlightLayer.style.display = 'block'
        // Force browser to apply styles
        void highlightLayer.offsetHeight
      }
      
      highlightLayer.appendChild(div)
      
      // Double-check highlight is visible after appending
      div.style.opacity = '1'
      div.style.visibility = 'visible'
      div.style.display = 'block'
      // Ensure backgroundColor is set (in case it was overridden)
      div.style.backgroundColor = highlightBgColor
      // Force browser to apply styles
      void div.offsetHeight
    })
    
    // Render connection dots on first and last rectangles
    if (firstRect && lastRect) {
      const firstX = firstRect.x * scaleRatio
      const firstY = firstRect.y * scaleRatioY
      const firstHeight = firstRect.height * scaleRatioY
      
      const lastX = lastRect.x * scaleRatio
      const lastY = lastRect.y * scaleRatioY
      const lastWidth = lastRect.width * scaleRatio
      const lastHeight = lastRect.height * scaleRatioY
      
      // Left dot on first rectangle
      const leftDot = document.createElement('div')
      leftDot.className = 'highlight-connection-dot'
      leftDot.dataset.highlightId = highlight.id
      leftDot.dataset.dot = 'left'
      leftDot.style.position = 'absolute'
      leftDot.style.left = (firstX - 5) + 'px'
      leftDot.style.top = (firstY + firstHeight / 2 - 5) + 'px'
      leftDot.style.width = '10px'
      leftDot.style.height = '10px'
      leftDot.style.borderRadius = '50%'
      leftDot.style.backgroundColor = dotColor
      leftDot.style.zIndex = '10'
      leftDot.style.cursor = 'pointer'
      leftDot.style.opacity = '0'
      leftDot.style.transition = 'opacity 0.2s ease, transform 0.2s ease'
      // In read mode, allow clicks to pass through to text spans below
      // In highlight mode, enable pointer events for connection interactions
      leftDot.style.pointerEvents = interactionMode === 'read' ? 'none' : 'auto'
      leftDot.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)'
      leftDot.style.border = '2px solid white'
      
      // Right dot on last rectangle
      const rightDot = document.createElement('div')
      rightDot.className = 'highlight-connection-dot'
      rightDot.dataset.highlightId = highlight.id
      rightDot.dataset.dot = 'right'
      rightDot.style.position = 'absolute'
      rightDot.style.left = (lastX + lastWidth - 5) + 'px'
      rightDot.style.top = (lastY + lastHeight / 2 - 5) + 'px'
      rightDot.style.width = '10px'
      rightDot.style.height = '10px'
      rightDot.style.borderRadius = '50%'
      rightDot.style.backgroundColor = dotColor
      rightDot.style.zIndex = '10'
      rightDot.style.cursor = 'pointer'
      rightDot.style.opacity = '0'
      rightDot.style.transition = 'opacity 0.2s ease, transform 0.2s ease'
      // In read mode, allow clicks to pass through to text spans below
      // In highlight mode, enable pointer events for connection interactions
      rightDot.style.pointerEvents = interactionMode === 'read' ? 'none' : 'auto'
      rightDot.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.3)'
      rightDot.style.border = '2px solid white'
      
      // Show dots on hover - handled by useEffect above
      // Also keep dots visible when hovering over them
      const showDotsAndConnections = () => {
        setHoveredHighlightId(highlight.id)
        leftDot.style.opacity = '1'
        rightDot.style.opacity = '1'
      }
      
      leftDot.addEventListener('mouseenter', showDotsAndConnections)
      rightDot.addEventListener('mouseenter', showDotsAndConnections)
      
      // Also show connections when clicking on dots
      const showConnectionsOnClick = () => {
        setHoveredHighlightId(highlight.id)
      }
      
      leftDot.addEventListener('click', showConnectionsOnClick)
      rightDot.addEventListener('click', showConnectionsOnClick)
      leftDot.addEventListener('mouseleave', () => {
        // Only hide if not hovering over the highlight itself
        setTimeout(() => {
          if (hoveredHighlightIdRef.current !== highlight.id) {
            leftDot.style.opacity = '0'
            rightDot.style.opacity = '0'
          }
        }, 100)
      })
      rightDot.addEventListener('mouseleave', () => {
        setTimeout(() => {
          if (hoveredHighlightIdRef.current !== highlight.id) {
            leftDot.style.opacity = '0'
            rightDot.style.opacity = '0'
          }
        }, 100)
      })
      
      // Handle dot clicks
      const handleDotClick = (e, dotSide) => {
        e.stopPropagation()
        e.preventDefault()
        
        // Use functional update to get current state
        setConnectingFrom(current => {
          if (!current) {
            // Start connection
            setHoveredHighlightId(highlight.id) // Keep highlight hovered to show dots
            return { highlightId: highlight.id, dot: dotSide }
          } else {
            // If clicking the same dot again, cancel connection
            if (current.highlightId === highlight.id && current.dot === dotSide) {
              setHoveredHighlightId(null)
              return null // Cancel connection
            }
            
            // Complete connection if same color and different highlight
            setHighlights(prev => {
              const fromHighlight = prev.find(h => h.id === current.highlightId)
              
              if (fromHighlight && fromHighlight.color === highlight.color && fromHighlight.id !== highlight.id) {
                // Create connection - but first remove any existing connections from these dots
                const updated = prev.map(h => {
                  if (h.id === current.highlightId) {
                    // Remove any existing connection from this dot
                    const connections = (h.connections || []).filter(
                      c => c.fromDot !== current.dot
                    )
                    // Also remove reverse connections from other highlights that were connected to this dot
                    const newConnections = connections.map(conn => {
                      // Find the target highlight and remove the reverse connection
                      const targetHighlight = prev.find(th => th.id === conn.to)
                      if (targetHighlight && targetHighlight.connections) {
                        // This will be handled when we process the target highlight
                      }
                      return conn
                    })
                    
                    // Add new connection
                    const newConnection = {
                      to: highlight.id,
                      fromDot: current.dot,
                      toDot: dotSide
                    }
                    return { ...h, connections: [...newConnections, newConnection] }
                  }
                  if (h.id === highlight.id) {
                    // Remove any existing connection from this dot
                    const connections = (h.connections || []).filter(
                      c => c.fromDot !== dotSide
                    )
                    
                    // Add new connection
                    const newConnection = {
                      to: current.highlightId,
                      fromDot: dotSide,
                      toDot: current.dot
                    }
                    return { ...h, connections: [...connections, newConnection] }
                  }
                  // For other highlights, remove any connections TO the dots we're connecting
                  // (in case they were previously connected to these dots)
                  const connections = (h.connections || []).filter(
                    c => !(
                      (c.to === current.highlightId && c.toDot === current.dot) ||
                      (c.to === highlight.id && c.toDot === dotSide)
                    )
                  )
                  return { ...h, connections }
                })
                return updated
              }
              return prev
            })
            // Clear hover state and remove borders immediately
            setHoveredHighlightId(null)
            setShowTooltipFor(null) // Hide tooltip
            // Also remove borders and hide dots from all highlight rectangles
            Object.values(highlightLayerRefs.current).forEach(layer => {
              if (layer) {
                const allRects = layer.querySelectorAll('.highlight-rect')
                allRects.forEach(rect => {
                  rect.style.border = 'none'
                })
                const allDots = layer.querySelectorAll('.highlight-connection-dot')
                allDots.forEach(dot => {
                  dot.style.opacity = '0'
                })
              }
            })
            return null // Clear connection state
          }
        })
      }
      
      leftDot.addEventListener('click', (e) => handleDotClick(e, 'left'))
      rightDot.addEventListener('click', (e) => handleDotClick(e, 'right'))
      
      // Create delete button for dots that have connections
      const createDeleteButton = (dot, dotSide) => {
        // Check if this dot has any connections (from this highlight OR to this highlight)
        const hasConnectionsFrom = highlight.connections && highlight.connections.some(
          conn => conn.fromDot === dotSide
        )
        
        // Check if any other highlight has a connection TO this highlight on this dot
        const hasConnectionsTo = highlights.some(h => 
          h.connections && h.connections.some(
            conn => conn.to === highlight.id && conn.toDot === dotSide
          )
        )
        
        if (!hasConnectionsFrom && !hasConnectionsTo) return null
        
        const deleteBtn = document.createElement('div')
        deleteBtn.className = 'highlight-connection-delete'
        deleteBtn.style.position = 'absolute'
        deleteBtn.style.left = (dotSide === 'left' ? firstX - 18 : lastX + lastWidth + 3) + 'px'
        deleteBtn.style.top = (dotSide === 'left' ? firstY + firstHeight / 2 - 6 : lastY + lastHeight / 2 - 6) + 'px'
        deleteBtn.style.width = '12px'
        deleteBtn.style.height = '12px'
        deleteBtn.style.borderRadius = '50%'
        deleteBtn.style.backgroundColor = '#000'
        deleteBtn.style.color = '#fff'
        deleteBtn.style.display = 'flex'
        deleteBtn.style.alignItems = 'center'
        deleteBtn.style.justifyContent = 'center'
        deleteBtn.style.fontSize = '8px'
        deleteBtn.style.fontWeight = 'bold'
        deleteBtn.style.lineHeight = '1'
        deleteBtn.style.cursor = 'pointer'
        deleteBtn.style.zIndex = '11'
        deleteBtn.style.opacity = '0'
        deleteBtn.style.transition = 'opacity 0.2s ease'
        deleteBtn.style.pointerEvents = 'auto'
        deleteBtn.textContent = '×'
        
        // Show delete button when hovering over the dot
        const showDelete = () => {
          deleteBtn.style.opacity = '1'
        }
        
        const hideDelete = () => {
          setTimeout(() => {
            if (!dot.matches(':hover') && !deleteBtn.matches(':hover')) {
              deleteBtn.style.opacity = '0'
            }
          }, 100)
        }
        
        dot.addEventListener('mouseenter', showDelete)
        dot.addEventListener('mouseleave', hideDelete)
        deleteBtn.addEventListener('mouseenter', showDelete)
        deleteBtn.addEventListener('mouseleave', hideDelete)
        
        // Handle delete click
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          e.preventDefault()
          
          // Remove all connections from this dot
          setHighlights(prev => {
            return prev.map(h => {
              if (h.id === highlight.id) {
                // Remove connections from this highlight where fromDot matches
                const filteredConnections = (h.connections || []).filter(
                  conn => conn.fromDot !== dotSide
                )
                return { ...h, connections: filteredConnections }
              } else {
                // Remove connections TO this highlight where toDot matches
                const filteredConnections = (h.connections || []).filter(
                  conn => !(conn.to === highlight.id && conn.toDot === dotSide)
                )
                return { ...h, connections: filteredConnections }
              }
            })
          })
          
          // Clear hover state immediately
          setTimeout(() => {
            setHoveredHighlightId(null)
          }, 0)
        })
        
        return deleteBtn
      }
      
      const leftDeleteBtn = createDeleteButton(leftDot, 'left')
      const rightDeleteBtn = createDeleteButton(rightDot, 'right')
      
      highlightLayer.appendChild(leftDot)
      highlightLayer.appendChild(rightDot)
      if (leftDeleteBtn) highlightLayer.appendChild(leftDeleteBtn)
      if (rightDeleteBtn) highlightLayer.appendChild(rightDeleteBtn)
    }
  }

  // Download PDF with highlights
  const handleDownloadPdf = async () => {
    if (!pdfArrayBufferRef.current || highlights.length === 0) {
      setError('No highlights to save. Please select and highlight some text first.')
      return
    }

    try {
      setIsLoading(true)
      setError('')
      
      // Load the PDF with pdf-lib
      // Create a fresh copy of the ArrayBuffer to avoid any issues
      const pdfData = new Uint8Array(pdfArrayBufferRef.current)
      
      // Try to load normally first
      let sourcePdfDoc
      let isEncrypted = false
      try {
        sourcePdfDoc = await PDFDocument.load(pdfData)
      } catch (err) {
        if (err.message && err.message.includes('encrypted')) {
          isEncrypted = true
          console.warn('PDF is encrypted. Attempting to load with ignoreEncryption option.')
          // Try loading with ignoreEncryption option
          sourcePdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true })
        } else {
          throw err
        }
      }
      
      // Create a new PDF document
      const newPdfDoc = await PDFDocument.create()
      
      // For encrypted PDFs, we need to render pages as images and embed them
      // For non-encrypted PDFs, we can copy pages directly
      let pages
      if (isEncrypted) {
        // Render each page as an image and embed it using PDF.js
        // Use the PDF.js document that's already loaded in state (pdfDoc)
        // For encrypted PDFs, pdf-lib can't parse the structure, so use PDF.js for everything
        pages = []
        if (!pdfDoc) {
          throw new Error('PDF.js document not available for encrypted PDF')
        }
        
        const numPages = pdfDoc.numPages
        for (let i = 0; i < numPages; i++) {
          // Render page to canvas using PDF.js (which we already have loaded in state)
          const pdfjsPage = await pdfDoc.getPage(i + 1) // pdfDoc state is PDF.js document, 1-indexed
          
          // Get page dimensions at scale 1.0 (actual PDF page size)
          const viewportAtScale1 = pdfjsPage.getViewport({ scale: 1.0 })
          const width = viewportAtScale1.width
          const height = viewportAtScale1.height
          
          // Use higher scale for rendering quality
          const viewport = pdfjsPage.getViewport({ scale: 2.0 })
          
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const context = canvas.getContext('2d')
          
          await pdfjsPage.render({
            canvasContext: context,
            viewport: viewport
          }).promise
          
          // Convert canvas to image and embed in new PDF
          const imageBytes = await new Promise((resolve) => {
            canvas.toBlob((blob) => {
              blob.arrayBuffer().then(resolve)
            }, 'image/png')
          })
          
          const image = await newPdfDoc.embedPng(imageBytes)
          const page = newPdfDoc.addPage([width, height])
          // Draw image at page size (scale 1.0 dimensions), even though it was rendered at scale 2.0
          page.drawImage(image, {
            x: 0,
            y: 0,
            width: width,
            height: height,
          })
          pages.push(page)
        }
      } else {
        // For non-encrypted PDFs, copy pages directly (preserves text)
        const copiedPages = await newPdfDoc.copyPages(sourcePdfDoc, sourcePdfDoc.getPageIndices())
        copiedPages.forEach((page) => {
          newPdfDoc.addPage(page)
        })
        pages = newPdfDoc.getPages()
      }

      // Add highlights to each page
      // We need pdfDoc (PDF.js document) to get accurate viewport dimensions
      if (!pdfDoc) {
        throw new Error('PDF.js document not available for coordinate conversion')
      }
      
      for (const highlight of highlights) {
        if (highlight.page <= pages.length) {
          const page = pages[highlight.page - 1] // pdf-lib uses 0-indexed
          const { width: pageWidth, height: pageHeight } = page.getSize()
          
          // Get the PDF.js page to calculate viewport at creation scale
          const pdfjsPage = await pdfDoc.getPage(highlight.page)
            const creationScale = highlight.scale || pageScale
          const viewportAtCreation = pdfjsPage.getViewport({ scale: creationScale })
          
          // Get the page dimensions from the new PDF document (what we're drawing on)
          // For encrypted PDFs, we created pages from images, so use PDF.js viewport dimensions
          // For non-encrypted PDFs, we copied pages, so dimensions should match
          let actualPageWidth, actualPageHeight
          if (isEncrypted) {
            // For encrypted PDFs, use the viewport at scale 1.0 to get actual PDF dimensions
            const viewportAtScale1 = pdfjsPage.getViewport({ scale: 1.0 })
            actualPageWidth = viewportAtScale1.width
            actualPageHeight = viewportAtScale1.height
          } else {
            // For non-encrypted PDFs, use the new PDF page dimensions (should match source)
            // Use pageWidth and pageHeight from the new PDF document
            actualPageWidth = pageWidth
            actualPageHeight = pageHeight
          }
          
          // Highlights are stored with coordinates relative to the text layer (in display pixels)
          // Text spans are positioned: spanX = viewportX * (displayedWidth / viewport.width)
          // where viewportX is in points (PDF coordinate space, just scaled)
          //
          // To convert highlight coordinates to PDF coordinates:
          //   1. Convert display pixels to viewport points: viewportX = highlightX * (viewport.width / displayedWidth)
          //   2. Viewport coordinates are already in PDF space, just scaled: pdfX = viewportX
          //
          // But wait - viewport coordinates are scaled by the scale factor.
          // At scale S: viewport.width = pageWidth * S
          // So: viewportX = highlightX * ((pageWidth * S) / displayedWidth)
          // And: pdfX = viewportX (since viewport coords are in PDF space)
          //
          // At creation: displayedWidth = viewportAtCreation.width (if no CSS scaling)
          // So: pdfX = highlightX * (pageWidth * creationScale / viewportAtCreation.width)
          // Since viewportAtCreation.width = pageWidth * creationScale:
          // pdfX = highlightX * (pageWidth * creationScale / (pageWidth * creationScale)) = highlightX
          //
          // That can't be right. Let me reconsider...
          //
          // Actually: viewport coordinates are in points, and at scale S, 
          // a point at PDF X maps to viewport X = PDF X (same value, just different scale context)
          // But the display shows it scaled. So:
          // - PDF X = 100 points
          // - At scale 1.5, viewport shows it at X = 100 points (in viewport space)
          // - Display shows it at X = 100 * (displayedWidth / viewport.width) pixels
          // - Highlight stored at X = 100 * (displayedWidth / viewport.width) pixels
          // - To convert back: pdfX = highlightX * (viewport.width / displayedWidth)
          // - Since viewport.width = pageWidth * scale: pdfX = highlightX * (pageWidth * scale / displayedWidth)
          // - If displayedWidth = viewport.width: pdfX = highlightX
          // - But that's only if scale = 1.0...
          
          // Get current canvas and text layer to check dimensions
          const canvas = canvasRefs.current[highlight.page]
          const textLayer = textLayerRefs.current[highlight.page]
          const pageInfo = pageData.find(p => p.pageNum === highlight.page)
          if (!pageInfo) continue
          
          // Get current viewport and canvas dimensions
          const currentViewportWidth = pageInfo.viewport.width
          const currentViewportHeight = pageInfo.viewport.height
          
          // Calculate text layer dimensions at creation time
          // The text layer dimensions are set to match the canvas DISPLAY size (from getBoundingClientRect())
          // At creation: canvas internal size = viewportAtCreation dimensions
          // Canvas CSS size is set to match internal size, but CSS may scale the actual display
          // Text layer width = canvas displayed width (from getBoundingClientRect())
          //
          // The key insight: text spans are positioned using viewport coordinates scaled by
          // scaleX = displayedWidth / canvasWidth. So the text layer coordinate system is
          // based on displayedWidth, not viewport.width directly.
          //
          // However, highlights are stored relative to the text layer, which has dimensions
          // matching displayedWidth. To convert to PDF, we need to account for this.
          //
          // Use the stored text layer dimensions from when the highlight was created
          // These are stored in the highlight object to ensure accurate conversion
          let textLayerWidthAtCreation = highlight.textLayerWidth
          let textLayerHeightAtCreation = highlight.textLayerHeight
          
          // Fallback: if stored values are not available (for old highlights), try to recalculate
          if (!textLayerWidthAtCreation || !textLayerHeightAtCreation) {
            // Fallback to viewport dimensions as default
            textLayerWidthAtCreation = viewportAtCreation.width
            textLayerHeightAtCreation = viewportAtCreation.height
            
            // Try to get from current DOM if scale hasn't changed
            if (textLayer && creationScale === pageScale) {
              const textLayerRect = textLayer.getBoundingClientRect()
              textLayerWidthAtCreation = textLayerRect.width
              textLayerHeightAtCreation = textLayerRect.height
            } else if (canvas && creationScale === pageScale) {
              const canvasRect = canvas.getBoundingClientRect()
              textLayerWidthAtCreation = canvasRect.width
              textLayerHeightAtCreation = canvasRect.height
            } else if (creationScale !== pageScale) {
              // Scale has changed, estimate creation-time dimensions
              const scaleRatio = creationScale / pageScale
              if (textLayer) {
                const textLayerRect = textLayer.getBoundingClientRect()
                textLayerWidthAtCreation = textLayerRect.width / scaleRatio
                textLayerHeightAtCreation = textLayerRect.height / scaleRatio
              } else if (canvas) {
                const canvasRect = canvas.getBoundingClientRect()
                textLayerWidthAtCreation = canvasRect.width / scaleRatio
                textLayerHeightAtCreation = canvasRect.height / scaleRatio
              }
            }
          }
          
          // Convert highlight coordinates from display pixels to PDF points
          // 
          // The key insight: Text spans are positioned using:
          //   span.style.left = tx[4] * scaleX
          // where:
          //   - tx[4] is the X coordinate in viewport space (points)
          //   - scaleX = displayedWidth / canvasWidth (converts viewport points to display pixels)
          //
          // So if a text span is at PDF X = 100 points:
          //   - viewport X = 100 (same value, viewport is PDF space scaled)
          //   - span.style.left = 100 * (displayedWidth / canvasWidth) pixels
          //
          // Highlights are stored relative to the text layer, so highlight.x is in the same
          // coordinate system as span.style.left (display pixels).
          //
          // To convert back to PDF:
          //   pdfX = highlightX / (displayedWidth / canvasWidth) / creationScale
          //   pdfX = highlightX * (canvasWidth / displayedWidth) / creationScale
          //
          // But canvasWidth = viewport.width = pageWidth * creationScale
          // So: pdfX = highlightX * (pageWidth * creationScale / displayedWidth) / creationScale
          //     pdfX = highlightX * (pageWidth / displayedWidth)
          //
          // Since textLayerWidth = displayedWidth:
          //   pdfX = highlightX * (pageWidth / textLayerWidth)
          //
          // However, we need to account for the fact that displayedWidth might differ from
          // viewport.width due to CSS scaling. The text layer is set to displayedWidth,
          // but text spans use scaleX = displayedWidth / canvasWidth.
          //
          // If canvasWidth = 646 and displayedWidth = 646.5, then:
          //   scaleX = 646.5 / 646 = 1.00077
          //   So a span at PDF X = 100 is positioned at 100.077 pixels
          //   To convert back: pdfX = 100.077 * (646 / 646.5) / 1.5 = 100.077 * 0.66615 = 66.68
          //
          // But we want: pdfX = 100
          // So we need: pdfX = highlightX * (canvasWidth / displayedWidth) * (1 / creationScale)
          //            pdfX = highlightX * (viewport.width / textLayerWidth) * (1 / creationScale)
          //            pdfX = highlightX * (pageWidth * creationScale / textLayerWidth) * (1 / creationScale)
          //            pdfX = highlightX * (pageWidth / textLayerWidth)
          //
          // Wait, that's what we're already doing! So the issue must be something else.
          //
          // Actually, I think the issue is that we need to account for the scaleX used in
          // positioning the spans. The text layer width is displayedWidth, but the spans
          // are positioned using scaleX = displayedWidth / canvasWidth.
          //
          // Let me try a different approach: convert using the actual relationship
          // between viewport coordinates and display pixels.
          // The key insight: Text spans are positioned using scaleX = displayedWidth / canvasWidth.
          // This means the coordinate system is based on canvasWidth (viewport width), not displayedWidth.
          // However, highlights are stored relative to the text layer, which has width = displayedWidth.
          //
          // To convert correctly, we need to account for this:
          // 1. Highlight coordinates are relative to text layer (width = displayedWidth)
          // 2. Text spans are positioned using: spanX = viewportX * (displayedWidth / canvasWidth)
          // 3. To reverse: viewportX = highlightX * (canvasWidth / displayedWidth)
          // 4. Then: pdfX = viewportX (viewport is PDF coordinate space)
          //
          // But viewport coordinates are at scale S, so:
          //   pdfX = viewportX = highlightX * (canvasWidth / displayedWidth)
          //   But we need to account for the scale...
          //
          // Actually, let's use canvasWidth (viewport width) directly for conversion:
          // This matches the coordinate system used for positioning spans
          const canvasWidthAtCreation = viewportAtCreation.width // This is canvas.width at creation
          const canvasHeightAtCreation = viewportAtCreation.height
          
          // Account for the difference between text layer width (displayedWidth) and canvas width (viewport width)
          // Text spans are positioned using: spanX = viewportX * (displayedWidth / canvasWidth)
          // Highlights are stored relative to text layer (width = displayedWidth)
          // To convert: first scale from text layer to canvas coordinate system, then to PDF
          //
          // Step 1: Convert from text layer coordinates to canvas/viewport coordinates
          //   viewportX = highlightX * (canvasWidth / displayedWidth)
          // Step 2: Convert from viewport coordinates to PDF coordinates
          //   pdfX = viewportX (since viewport is PDF coordinate space at scale S)
          //   But we need: pdfX = viewportX (no scaling needed, viewport is already in PDF space)
          //
          // Actually, viewport coordinates are in PDF space, just at a different scale.
          // At scale S: viewport.width = pageWidth * S
          // So: pdfX = viewportX (they're the same coordinate system)
          //
          // Combined: pdfX = highlightX * (canvasWidth / displayedWidth)
          //          pdfX = highlightX * (canvasWidthAtCreation / textLayerWidthAtCreation)
          //
          // But we also need to account for the scale factor to get from viewport to PDF:
          // Since viewport.width = pageWidth * creationScale:
          //   pdfX = highlightX * (canvasWidth / displayedWidth) * (pageWidth / viewport.width)
          //   pdfX = highlightX * (canvasWidth / displayedWidth) * (pageWidth / (pageWidth * creationScale))
          //   pdfX = highlightX * (canvasWidth / displayedWidth) / creationScale
          //
          // Since canvasWidth = viewport.width = pageWidth * creationScale:
          //   pdfX = highlightX * ((pageWidth * creationScale) / displayedWidth) / creationScale
          //   pdfX = highlightX * (pageWidth / displayedWidth)
          //
          // That's what we were doing before! So the issue is that we need to use
          // the ratio between canvasWidth and textLayerWidth to adjust the conversion.
          //
          // Let's try: pdfX = highlightX * (canvasWidth / textLayerWidth) * (pageWidth / canvasWidth)
          //           pdfX = highlightX * (pageWidth / textLayerWidth) * (canvasWidth / canvasWidth)
          //           pdfX = highlightX * (pageWidth / textLayerWidth)
          //
          // Hmm, that's still the same. Let me think differently...
          //
          // The real issue: highlights are in text layer coordinates (based on displayedWidth),
          // but text spans are positioned using canvasWidth. We need to account for this difference.
          //
          // Since text layer width = displayedWidth and canvas width = viewport.width,
          // and displayedWidth might differ slightly from viewport.width due to CSS,
          // we should use canvasWidth (viewport width) for conversion, as that's what
          // the span positioning is based on.
          //
          // However, highlights are stored relative to text layer, so we need to adjust:
          // pdfX = highlightX * (canvasWidth / textLayerWidth) * (pageWidth / canvasWidth)
          //      = highlightX * (pageWidth / textLayerWidth)
          //
          // So we should use textLayerWidth, but the issue is that textLayerWidth might
          // not match what was used at creation time if CSS scaling changed.
          //
          // Convert highlight coordinates to PDF coordinates
          // The key insight: spans are positioned using viewport coordinates (which are in PDF space)
          // span.style.left = tx[4] * (textLayerWidth / viewportWidth)
          // where tx[4] is in PDF points
          //
          // At creation, if textLayerWidth = viewportWidth (both 918), then:
          //   span.style.left = tx[4] (same numeric value, but different units)
          //
          // To convert highlight coordinates back to PDF:
          // Since highlights are stored in the same coordinate system as span.style.left,
          // and viewport coordinates are in PDF space, we need to account for the scale.
          //
          // The conversion should be: pdfX = highlightX * (actualPageWidth / textLayerWidthAtCreation)
          // This converts from text layer pixels to PDF points
          const scaleX = actualPageWidth / textLayerWidthAtCreation
          const scaleY = actualPageHeight / textLayerHeightAtCreation
          
          // Debug: compare different approaches
          if (canvas && highlight.page === 1) {
            const canvasInternalWidth = canvas.width
            const canvasInternalHeight = canvas.height
            console.log('Conversion method comparison:', {
              usingCanvasInternalWidth: { 
                scaleX: actualPageWidth / canvasInternalWidth, 
                scaleY: actualPageHeight / canvasInternalHeight,
                canvasWidth: canvasInternalWidth
              },
              usingTextLayerWidth: { 
                scaleX: actualPageWidth / textLayerWidthAtCreation, 
                scaleY: actualPageHeight / textLayerHeightAtCreation,
                textLayerWidth: textLayerWidthAtCreation
              },
              usingViewportWidth: {
                scaleX: actualPageWidth / canvasWidthAtCreation,
                scaleY: actualPageHeight / canvasHeightAtCreation,
                viewportWidth: canvasWidthAtCreation
              },
              differences: {
                canvasVsTextLayer: {
                  x: (actualPageWidth / canvasInternalWidth) - (actualPageWidth / textLayerWidthAtCreation),
                  y: (actualPageHeight / canvasInternalHeight) - (actualPageHeight / textLayerHeightAtCreation)
                }
              }
            })
          }
          
          // Verify: scaleX should equal 1 / (creationScale * cssScaleX)
          if (canvas && highlight.page === 1) {
            const expectedScaleX = 1 / (creationScale * (canvas.getBoundingClientRect().width / canvas.width))
            console.log('Scale verification:', {
              calculatedScaleX: scaleX,
              expectedScaleX: expectedScaleX,
              difference: Math.abs(scaleX - expectedScaleX),
              creationScale,
              cssScaleX: canvas.getBoundingClientRect().width / canvas.width
            })
          }
          
          // Debug logging (remove after fixing)
          if (highlight.page === 1 && highlight.rects && highlight.rects.length > 0) {
            const firstRect = highlight.rects[0]
            const calculatedPdfX = firstRect.x * scaleX
            const calculatedPdfY = actualPageHeight - (firstRect.y * scaleY) - (firstRect.height * scaleY)
            const calculatedPdfWidth = firstRect.width * scaleX
            const calculatedPdfHeight = firstRect.height * scaleY
            
            // Check if coordinates are valid
            const isValid = calculatedPdfWidth > 0 && calculatedPdfHeight > 0 && 
                           calculatedPdfX >= 0 && calculatedPdfY >= 0 && 
                           calculatedPdfX + calculatedPdfWidth <= actualPageWidth && 
                           calculatedPdfY + calculatedPdfHeight <= actualPageHeight
            
            // Expand the log to see all values
            const debugInfo = {
              page: highlight.page,
              creationScale,
              currentPageScale: pageScale,
              viewportAtCreation: { 
                width: viewportAtCreation.width, 
                height: viewportAtCreation.height 
              },
              currentViewport: { 
                width: currentViewportWidth, 
                height: currentViewportHeight 
              },
              textLayerAtCreation: { 
                width: textLayerWidthAtCreation, 
                height: textLayerHeightAtCreation 
              },
              actualPageSize: { 
                width: actualPageWidth, 
                height: actualPageHeight 
              },
              scale: { 
                x: scaleX, 
                y: scaleY 
              },
              firstRect: { 
                x: firstRect.x, 
                y: firstRect.y, 
                width: firstRect.width, 
                height: firstRect.height 
              },
              calculatedPdfCoords: {
                x: calculatedPdfX,
                y: calculatedPdfY,
                width: calculatedPdfWidth,
                height: calculatedPdfHeight
              },
              isValid,
              canvas: canvas ? {
                internalWidth: canvas.width,
                internalHeight: canvas.height,
                displayWidth: canvas.getBoundingClientRect().width,
                displayHeight: canvas.getBoundingClientRect().height,
                cssScaleX: canvas.getBoundingClientRect().width / canvas.width,
                cssScaleY: canvas.getBoundingClientRect().height / canvas.height
              } : null
            }
            
            // Log with expanded objects
            console.log('Highlight conversion debug:', JSON.parse(JSON.stringify(debugInfo)))
            
            // Also log the calculation steps
            console.log('Calculation steps:', {
              step1_textLayerWidth: `viewportAtCreation.width (${viewportAtCreation.width}) * cssScaleX (${canvas ? canvas.getBoundingClientRect().width / canvas.width : 1}) = ${textLayerWidthAtCreation}`,
              step2_scaleX: `actualPageWidth (${actualPageWidth}) / textLayerWidthAtCreation (${textLayerWidthAtCreation}) = ${scaleX}`,
              step3_pdfX: `firstRect.x (${firstRect.x}) * scaleX (${scaleX}) = ${calculatedPdfX}`,
              expectedRatio: `If correct, scaleX should be approximately: ${actualPageWidth / viewportAtCreation.width} (pageWidth/viewportWidth)`
            })
          }
            
            // Support both old format (single rect) and new format (array of rects)
            const rects = highlight.rects || [{
              x: highlight.x || 0,
              y: highlight.y || 0,
              width: highlight.width || 0,
              height: highlight.height || 0
            }]
            
            // Get highlight color based on highlight.color
            const highlightColor = highlight.color || 'yellow'
            let pdfColor
            let pdfOpacity = 0.24 // Default opacity for highlights
            
            switch (highlightColor) {
              case 'yellow':
                pdfColor = rgb(0.984, 0.737, 0.016) // rgba(251, 188, 4) normalized
                pdfOpacity = 0.24
                break
              case 'green':
                pdfColor = rgb(0.204, 0.659, 0.325) // rgba(52, 168, 83) normalized
                pdfOpacity = 0.24
                break
              case 'blue':
                pdfColor = rgb(0.259, 0.522, 0.957) // rgba(66, 133, 244) normalized
                pdfOpacity = 0.24
                break
              default:
                pdfColor = rgb(0.984, 0.737, 0.016) // Default to yellow
                pdfOpacity = 0.24
            }
            
            // Draw each rectangle separately
            rects.forEach(rect => {
              // Convert highlight coordinates to PDF coordinates
            // Highlights are stored relative to text layer (top-left origin, in display pixels)
            // Text layer coordinates: y=0 at top, increasing downward
            // PDF coordinates: y=0 at bottom, increasing upward
            //
            // Conversion steps:
            // 1. Convert display pixels to viewport points: viewportY = highlightY * (viewport.height / textLayer.height)
            // 2. Convert viewport Y (from top) to PDF Y (from bottom):
            //    - In viewport: y=0 at top, y=viewport.height at bottom
            //    - In PDF: y=0 at bottom, y=pageHeight at top
            //    - So: pdfY = viewport.height - viewportY
            //    - But viewport.height = pageHeight * scale, so: pdfY = (pageHeight * scale) - viewportY
            //    - Simplifying: pdfY = pageHeight - (highlightY * scaleY)
            //
            // Actually, since text layer Y is from top and PDF Y is from bottom:
            // pdfY = actualPageHeight - (rect.y * scaleY) - (rect.height * scaleY)
            
            // Convert highlight coordinates to PDF coordinates
            // The key insight: text spans are positioned using viewport coordinates scaled by display/canvas ratio
            // So: spanX = viewportX * (displayedWidth / canvasWidth)
            // To reverse: viewportX = spanX * (canvasWidth / displayedWidth)
            // Then: pdfX = viewportX (since viewport is PDF coordinate space)
            //
            // But wait - viewport coordinates are at scale S, so:
            //   viewport.width = pageWidth * S
            //   A point at PDF X = 100 appears at viewport X = 100 (same value, different scale context)
            //   So pdfX = viewportX directly
            //
            // However, we need to account for the scaleX used in positioning:
            //   spanX = viewportX * scaleX, where scaleX = displayedWidth / canvasWidth
            //   So: viewportX = spanX / scaleX = spanX * (canvasWidth / displayedWidth)
            //   pdfX = viewportX = spanX * (canvasWidth / displayedWidth)
            //
            // Since canvasWidth = viewport.width = pageWidth * creationScale:
            //   pdfX = highlightX * ((pageWidth * creationScale) / displayedWidth)
            //   pdfX = highlightX * (pageWidth * creationScale / textLayerWidth)
            //
            // But we're using: pdfX = highlightX * (pageWidth / textLayerWidth)
            // That's missing the creationScale factor!
            //
            // Actually wait - let me reconsider. The viewport is PDF space scaled.
            // At scale 1.5: viewport.width = 431 * 1.5 = 646.5
            // A point at PDF X = 100 is at viewport X = 100 (in viewport coordinate space)
            // But viewport coordinate space is scaled, so to get PDF coordinate:
            //   pdfX = viewportX (they're the same value, just different scale)
            //
            // So: pdfX = highlightX * (canvasWidth / displayedWidth)
            //     pdfX = highlightX * (viewport.width / textLayerWidth)
            //     pdfX = highlightX * ((pageWidth * creationScale) / textLayerWidth)
            //
            // But textLayerWidth = displayedWidth ≈ viewport.width (if no CSS scaling)
            // So: pdfX = highlightX * ((pageWidth * creationScale) / viewport.width)
            //     pdfX = highlightX * ((pageWidth * creationScale) / (pageWidth * creationScale))
            //     pdfX = highlightX
            //
            // That can't be right either. Let me think about this more carefully.
            //
            // The correct conversion should be:
            //   1. highlightX is in display pixels relative to text layer (width = displayedWidth)
            //   2. Convert to viewport coordinates: viewportX = highlightX * (viewport.width / displayedWidth)
            //   3. Convert viewport to PDF: pdfX = viewportX (same value, viewport is PDF space)
            //
            // So: pdfX = highlightX * (viewport.width / displayedWidth)
            //     pdfX = highlightX * ((pageWidth * creationScale) / textLayerWidth)
            //
            // But we're doing: pdfX = highlightX * (pageWidth / textLayerWidth)
            // We're missing the creationScale factor!
            
            // The conversion should be: pdfX = highlightX * (pageWidth / textLayerWidth)
            // But if highlights are shifted left, we might need to account for an offset
            // or use a different conversion. Let me check if there's a crop box offset.
            
            // Get crop box from source page to check for offsets
            // For encrypted PDFs, sourcePage is not available, so default to 0
            let cropBox = null
            let mediaBox = null
            let cropOffsetX = 0
            let cropOffsetY = 0
            
            if (!isEncrypted) {
              // For non-encrypted PDFs, get crop box from source page
              const sourcePage = sourcePdfDoc.getPage(highlight.page - 1) // pdf-lib uses 0-indexed
              cropBox = sourcePage.getCropBox()
              mediaBox = sourcePage.getMediaBox()
              
              // Calculate any offset from crop box (crop box defines the visible area)
              cropOffsetX = cropBox ? cropBox.x : 0
              cropOffsetY = cropBox ? cropBox.y : 0
            }
            // For encrypted PDFs, cropOffsetX and cropOffsetY remain 0 (default)
            
            // Convert highlight coordinates to PDF coordinates
            // The key insight: viewport coordinates are in PDF coordinate space, but scaled by creationScale
            // At scale S: viewport.width = pageWidth * S
            // A point at PDF X appears at the same X value in viewport space (they're the same coordinate system)
            // But to convert from viewport coordinates to PDF coordinates, we need to account for the scale
            //
            // Actually, PDF.js viewport coordinates ARE in PDF coordinate space directly.
            // So: pdfX = viewportX, where viewportX = highlightX * (viewport.width / textLayerWidth)
            //
            // But since viewport.width = pageWidth * creationScale and textLayerWidth ≈ viewport.width:
            //   pdfX = highlightX * ((pageWidth * creationScale) / textLayerWidth)
            //
            // If textLayerWidth = viewport.width = pageWidth * creationScale:
            //   pdfX = highlightX * ((pageWidth * creationScale) / (pageWidth * creationScale)) = highlightX
            //
            // That's clearly wrong. The issue is that textLayerWidth is the DISPLAY size, not the viewport size.
            // The text layer is scaled by CSS, so textLayerWidth = viewport.width * cssScale
            //
            // So: pdfX = highlightX * (viewport.width / textLayerWidth)
            //     pdfX = highlightX * (viewport.width / (viewport.width * cssScale))
            //     pdfX = highlightX / cssScale
            //
            // But cssScale ≈ 1.0, so that's close to highlightX, which is wrong.
            //
            // Let me reconsider: the text spans are positioned using:
            //   spanX = viewportX * (displayedWidth / canvasWidth)
            // where viewportX is in viewport coordinate space (points).
            // To reverse: viewportX = spanX * (canvasWidth / displayedWidth)
            // Then: pdfX = viewportX (same value)
            //
            // So: pdfX = highlightX * (canvasWidth / displayedWidth)
            //     pdfX = highlightX * (viewport.width / textLayerWidth)
            //
            // Since viewport.width = pageWidth * creationScale and textLayerWidth = displayedWidth:
            //   pdfX = highlightX * ((pageWidth * creationScale) / textLayerWidth)
            //
            // But we want: pdfX = highlightX * (pageWidth / textLayerWidth) * creationScale
            // Wait, that's the same thing!
            //
            // Actually, I think the issue is simpler. The viewport coordinates are already in PDF space.
            // So we should convert directly: pdfX = highlightX * (pageWidth / textLayerWidth)
            // This is what we're doing, and the scale is correct (0.6667).
            //
            // But if highlights are still shifted left, maybe there's an offset we're missing.
            // Let me check if the PDF page content starts at (0,0) or if there's a content offset.
            
            // The correct conversion path:
            // 1. highlightX is in display pixels relative to text layer (same as span.style.left)
            // 2. Text spans are positioned: span.style.left = viewportX * scaleX
            //    where scaleX = displayedWidth / canvasWidth = displayedWidth / viewport.width
            // 3. To reverse: viewportX = highlightX / scaleX = highlightX * (canvasWidth / displayedWidth)
            // 4. Viewport coordinates are in PDF coordinate space (points), so pdfX = viewportX
            //
            // So: pdfX = highlightX * (canvasWidth / displayedWidth)
            //     pdfX = highlightX * (viewport.width / textLayerWidth)
            //
            // Since viewport.width = pageWidth * creationScale and textLayerWidth = displayedWidth:
            //   pdfX = highlightX * ((pageWidth * creationScale) / textLayerWidth)
            //
            // But wait - viewport coordinates ARE in PDF space, but they're scaled.
            // At scale 1.5, a PDF point at X=100 appears at viewport X=100 (same value).
            // So pdfX = viewportX directly, no need to divide by scale.
            //
            // So: pdfX = highlightX * (viewport.width / textLayerWidth)
            //     pdfX = highlightX * ((pageWidth * creationScale) / textLayerWidth)
            //
            // But we're currently using: pdfX = highlightX * (pageWidth / textLayerWidth)
            // That's missing the creationScale factor! But that would make pdfX larger, not smaller.
            //
            // Actually, I think the issue is that viewport coordinates are NOT the same as PDF coordinates.
            // Viewport is a scaled view of the PDF. At scale S:
            //   - PDF point at X = 100
            //   - Viewport shows it at X = 100 (in viewport coordinate space)
            //   - But viewport.width = pageWidth * S
            //
            // So if a highlight is at display pixel X = 171.21:
            //   - textLayerWidth = 646.5 (display pixels)
            //   - viewportX = 171.21 * (646.5 / 646.5) = 171.21 (if no CSS scaling)
            //   - But this is in viewport coordinate space, not PDF coordinate space!
            //   - To convert: pdfX = viewportX / creationScale = 171.21 / 1.5 = 114.14
            //
            // So the correct conversion is:
            //   pdfX = (highlightX * (viewport.width / textLayerWidth)) / creationScale
            //   pdfX = highlightX * (viewport.width / textLayerWidth) / creationScale
            //   pdfX = highlightX * ((pageWidth * creationScale) / textLayerWidth) / creationScale
            //   pdfX = highlightX * (pageWidth / textLayerWidth)
            //
            // That's what we're already doing! So the conversion should be correct.
            //
            // But wait - maybe the issue is that we're using textLayerWidthAtCreation which might not
            // match the actual displayed width at creation time due to CSS scaling.
            // Let me check: if cssScaleX = 1.00077, then displayedWidth = canvasWidth * cssScaleX
            // So textLayerWidth = displayedWidth = canvasWidth * cssScaleX = viewport.width * cssScaleX
            //
            // So: pdfX = highlightX * (viewport.width / (viewport.width * cssScaleX)) / creationScale
            //     pdfX = highlightX / (cssScaleX * creationScale)
            //
            // But we're doing: pdfX = highlightX * (pageWidth / textLayerWidth)
            //                 pdfX = highlightX * (pageWidth / (viewport.width * cssScaleX))
            //                 pdfX = highlightX * (pageWidth / (pageWidth * creationScale * cssScaleX))
            //                 pdfX = highlightX / (creationScale * cssScaleX)
            //
            // That's the same! So the conversion should be correct.
            //
            // The key insight: text spans are positioned using canvas internal dimensions
            // span.style.left = viewportX * (displayedWidth / canvasWidth)
            // To reverse: viewportX = highlightX * (canvasWidth / displayedWidth)
            // Since viewport coordinates are in PDF space: pdfX = viewportX
            //
            // But we need to account for the fact that viewport coordinates are scaled.
            // At scale S: viewport.width = pageWidth * S, but canvas.width = viewport.width (approximately)
            // So: pdfX = highlightX * (canvasWidth / displayedWidth)
            //     pdfX = highlightX * (canvasWidth / textLayerWidth)
            //
            // But canvasWidth = viewport.width (at creation scale), so:
            //   pdfX = highlightX * (viewport.width / textLayerWidth)
            //
            // And since viewport.width = pageWidth * creationScale:
            //   pdfX = highlightX * ((pageWidth * creationScale) / textLayerWidth)
            //
            // But to get PDF coordinates, we need to divide by creationScale:
            //   pdfX = highlightX * ((pageWidth * creationScale) / textLayerWidth) / creationScale
            //   pdfX = highlightX * (pageWidth / textLayerWidth)
            //
            // That's what we're already doing! So the conversion should be correct.
            //
            // But wait - maybe the issue is that we're using textLayerWidthAtCreation which might
            // not match the actual displayed width at creation time. Let me check the debug output:
            // - canvas.internalWidth: 646
            // - canvas.displayWidth: 646.5
            // - textLayerWidth: 646.5
            // - viewport.width: 646.5
            //
            // Convert highlight coordinates to PDF coordinates
            // Highlights are stored relative to text layer at creation time
            // Text spans are positioned: span.style.left = viewportX * (displayedWidth / canvasWidth)
            // To reverse: viewportX = highlightX * (canvasWidth / displayedWidth) = highlightX * (viewportAtCreation.width / textLayerWidthAtCreation)
            // Viewport coordinates are in PDF coordinate space, so pdfX = viewportX
            // Convert coordinates using the relationship: span.style.left = tx[4] * scaleX
            // where tx[4] is in PDF points and scaleX = textLayerWidth / viewportWidth
            // At creation: textLayerWidth = viewportWidth, so scaleX = 1
            // Therefore: span.style.left = tx[4] (same value, but in different units)
            //
            // But wait, the units are different: span.style.left is in CSS pixels, tx[4] is in PDF points
            // At 1:1 scale, 1 CSS pixel = 1 PDF point, but we're at creationScale = 1.5
            //
            // Actually, let me reconsider: viewport coordinates ARE in PDF space (points)
            // But the viewport dimensions are scaled: viewport.width = pageWidth * scale
            // The coordinate VALUES are still in PDF points though
            //
            // So: span.style.left = tx[4] * (textLayerWidth / viewportWidth)
            //     = tx[4] * (918 / 918) = tx[4] (same numeric value)
            //
            // To reverse: pdfX = highlightX (if textLayerWidth = viewportWidth)
            // But we need to account for units: highlightX is in pixels, pdfX is in points
            // At creationScale = 1.5, viewport.width = 918 points, textLayer.width = 918 pixels
            // So 1 pixel = 1 point at this scale? No, that doesn't make sense.
            //
            // Let me use the direct conversion: pdfX = highlightX * (actualPageWidth / textLayerWidthAtCreation)
            const pdfX = rect.x * scaleX + cropOffsetX
            
            // For Y: span.style.top = (tx[5] - fontHeight) * scaleY
            // where tx[5] is PDF baseline Y (from bottom, in PDF points)
            // rect.y is top edge in text layer (matches span.style.top)
            //
            // The bottom edge of highlight in text layer: rect.y + rect.height
            // Distance from bottom of text layer: textLayerHeightAtCreation - (rect.y + rect.height)
            // Convert to PDF: multiply by (actualPageHeight / textLayerHeightAtCreation)
            const distanceFromBottomInTextLayer = textLayerHeightAtCreation - (rect.y + rect.height)
            const pdfY = distanceFromBottomInTextLayer * scaleY + cropOffsetY
            
            // Convert width and height (both in same units, just scale)
            const pdfWidth = rect.width * scaleX
            const pdfHeight = rect.height * scaleY
            
            // Debug: detailed conversion info
            if (highlight.page === 1 && rects.indexOf(rect) === 0) {
              const method1X = rect.x * scaleX
              const method2X = rect.x * (viewportAtCreation.width / textLayerWidthAtCreation)
              const method3X = rect.x * (viewportAtCreation.width / textLayerWidthAtCreation) / creationScale
              
              // Y coordinate conversion debugging
              const distanceFromTop = rect.y
              const distanceFromBottom = textLayerHeightAtCreation - (rect.y + rect.height)
              const calculatedPdfY = distanceFromBottom * scaleY
              
              console.log('PDF conversion debug:', {
                highlightRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                calculatedPdfCoords: { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight },
                yConversion: {
                  distanceFromTop,
                  distanceFromBottom,
                  textLayerHeightAtCreation,
                  scaleY,
                  calculatedPdfY,
                  actualPageHeight
                },
                method1_usingPageWidth: { 
                  pdfX: method1X, 
                  scaleX, 
                  formula: 'highlightX * (actualPageWidth / textLayerWidth)' 
                },
                method2_usingViewportWidth: { 
                  pdfX: method2X, 
                  ratio: viewportAtCreation.width / textLayerWidthAtCreation, 
                  formula: 'highlightX * (viewportWidth / textLayerWidth)' 
                },
                method3_usingViewportWidthDividedByScale: {
                  pdfX: method3X,
                  formula: 'highlightX * (viewportWidth / textLayerWidth) / creationScale'
                },
                dimensions: {
                  actualPageWidth,
                  actualPageHeight,
                  viewportAtCreation: { width: viewportAtCreation.width, height: viewportAtCreation.height },
                  textLayerAtCreation: { width: textLayerWidthAtCreation, height: textLayerHeightAtCreation },
                  creationScale,
                  storedTextLayerWidth: highlight.textLayerWidth,
                  storedTextLayerHeight: highlight.textLayerHeight
                },
                pageBoxes: {
                  cropBox: cropBox ? { x: cropBox.x, y: cropBox.y, width: cropBox.width, height: cropBox.height } : null,
                  mediaBox: mediaBox ? { x: mediaBox.x, y: mediaBox.y, width: mediaBox.width, height: mediaBox.height } : null,
                  cropOffset: { x: cropOffsetX, y: cropOffsetY }
                }
              })
            }
              
              // Only draw if coordinates are valid and within page bounds
            // Use actualPageWidth/Height for bounds checking
            // Add some tolerance for floating point errors
            const tolerance = 1.0
            const isValid = pdfWidth > 0 && pdfHeight > 0 && 
                           pdfX >= -tolerance && pdfY >= -tolerance && 
                           pdfX + pdfWidth <= actualPageWidth + tolerance && 
                           pdfY + pdfHeight <= actualPageHeight + tolerance
            
            // Debug logging for invalid coordinates
            if (!isValid && highlight.page === 1) {
              console.warn('Highlight out of bounds:', {
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                pdfCoords: { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight },
                pageSize: { width: actualPageWidth, height: actualPageHeight },
                scale: { x: scaleX, y: scaleY },
                textLayerAtCreation: { width: textLayerWidthAtCreation, height: textLayerHeightAtCreation }
              })
            }
            
            if (isValid) {
                // Add highlight annotation with proper color and opacity
                page.drawRectangle({
                x: Math.max(0, pdfX), // Clamp to page bounds
                y: Math.max(0, pdfY),
                width: Math.min(pdfWidth, actualPageWidth - Math.max(0, pdfX)),
                height: Math.min(pdfHeight, actualPageHeight - Math.max(0, pdfY)),
                  color: pdfColor,
                  opacity: pdfOpacity,
                  borderOpacity: 0
                })
              }
            })
          }
        }

      // Save the PDF
      // Since we created a new document, it should save without encryption issues
      const pdfBytes = await newPdfDoc.save()
      
      // Verify the PDF bytes are valid
      if (!pdfBytes || pdfBytes.length === 0) {
        throw new Error('Failed to generate PDF bytes')
      }
      
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = pdfFile.name.replace('.pdf', '_highlighted.pdf')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      setError('')
    } catch (err) {
      console.error('Error downloading PDF:', err)
      setError('Error creating PDF with highlights: ' + err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // Render loading state or redirect to dashboard (when no PDF is loaded)
  
  // Use the early render decision to determine what to return
  // Since execution doesn't reach here, use the early decision instead
  if (shouldRedirect) {
    // Redirect will happen via useEffect, just show loading
    return (
      <div className="app app-upload">
        <div className="container container-upload">
          <div className="loading">
            <div className="spinner"></div>
            <p>Redirecting to dashboard...</p>
          </div>
        </div>
      </div>
    )
  }
  
  if (shouldRenderLoading) {
    return (
      <div className="app app-upload">
        <div className="container container-upload">
          <header className="header">
            <div className="header-logo">
              <img src="/logo.png" alt="SpeechCase" className="logo" />
            </div>
            <h1>Casedive</h1>
          </header>

          <div className="upload-section">
            <div className="loading">
              <div className="spinner"></div>
              <p>Loading PDF...</p>
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }
  
  if (!pdfDoc) {
    try {
      const renderCheckDataLate = {hasPdfDoc:!!pdfDoc,hasPdfFile:!!pdfFile,pdfFileName:pdfFile?.name,isLoading,hasFileInState:!!location.state?.file,hasDocumentInState:!!location.state?.documentId,documentIdFromUrl,totalPages};
    } catch(e) {
      console.error('Early return render check error:', e);
    }
    // Check if we're loading a PDF from dashboard (file or documentId in state) or currently loading
    const hasFileInState = location.state?.file
    const hasDocumentInState = location.state?.documentId
    const isProcessingPDF = isLoading || hasFileInState || hasDocumentInState

    // If we're processing a PDF, show loading state
    if (isProcessingPDF) {
      return (
        <div className="app app-upload">
          <div className="container container-upload">
            <header className="header">
              <div className="header-logo">
                <img src="/logo.png" alt="SpeechCase" className="logo" />
              </div>
              <h1>Casedive</h1>
            </header>

            <div className="upload-section">
              <div className="loading">
                <div className="spinner"></div>
                <p>Loading PDF...</p>
              </div>

              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    // If no PDF and not processing, show loading state (redirect will happen via useEffect)
    return (
      <div className="app app-upload">
        <div className="container container-upload">
          <div className="loading">
            <div className="spinner"></div>
            <p>Redirecting to dashboard...</p>
          </div>
        </div>
      </div>
    )
  }

  // Render PDF reader mode (when PDF is loaded)
  // Use the early render decision
  if (shouldRenderPDFReader) {
  return (
    <div className="app app-reader">
      {/* Top Toolbar */}
      <div className={`reader-toolbar ${isMobile ? (toolbarVisible ? 'toolbar-visible' : 'toolbar-hidden') : ''}`}>
        <div className="toolbar-left">
          <div className="toolbar-logo">
            <img src="/logo.png" alt="SpeechCase" className="logo-small" />
            <span className="toolbar-title">Casediver</span>
          </div>
          <div className="toolbar-file-info">
            <IconDocument size={16} />
            <span className="file-name-small">{pdfFile.name}</span>
            {totalPages > 0 && (
              <span className="page-count-small">• {totalPages} page{totalPages !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
        
        <div className="toolbar-center">
          <div className="mode-toggle">
          <button
              onClick={() => setInteractionMode('select')}
              className={`mode-btn ${interactionMode === 'select' ? 'active' : ''}`}
              title="Select text (temporary highlight)"
            >
              <IconCursor size={18} />
            </button>
            <div className="mode-btn-separator"></div>
            <button
              onClick={() => setInteractionMode('read')}
              className={`mode-btn ${interactionMode === 'read' ? 'active' : ''}`}
              title="Click words to set reading start position"
            >
              <IconSpeaker size={18} />
            </button>
            <div className="mode-btn-separator"></div>
            <button
              onClick={() => setInteractionMode('highlight')}
              className={`mode-btn ${interactionMode === 'highlight' ? 'active' : ''}`}
              title="Select text to create highlights"
            >
              <IconHighlighter size={18} />
            </button>
            
            
          </div>
          {interactionMode === 'highlight' && (
            <button
              onClick={() => setIsSnippingMode(!isSnippingMode)}
              className={`snip-btn ${isSnippingMode ? 'active' : ''}`}
              title="Snip screenshot from PDF"
            >
              <IconScissors size={18} />
            </button>
          )}
          {interactionMode === 'highlight' && (
            <div className="undo-redo-toolbar">
              <button
                onClick={handleUndoHighlight}
                className="btn-toolbar-undo-redo"
                disabled={historyIndex <= 0}
                title="Undo (Ctrl+Z)"
              >
                <IconUndo size={14} />
              </button>
              <button
                onClick={handleRedoHighlight}
                className="btn-toolbar-undo-redo"
                disabled={historyIndex >= highlightHistory.length - 1}
                title="Redo (Ctrl+Shift+Z)"
              >
                <IconRedo size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="toolbar-right">
        {interactionMode === 'highlight' && highlights.length > 0 && (
            <button
              onClick={handleDownloadPdf}
              className="btn-toolbar"
              disabled={isLoading || highlights.length === 0}
              title="Download Highlighted PDF"
            >
              <IconDownload size={16} />
              <span>Download Highlighted PDF</span>
            </button>
          )}
          {totalPages > 0 && (
            <div className="page-counter">
              <span className="page-counter-text">Page {currentPage} of {totalPages}</span>
            </div>
          )}
          <div className="zoom-controls">
            <button
              onClick={handleZoomOut}
              className="btn-zoom"
              disabled={pageScale <= 0.5}
              title="Zoom out"
            >
              <IconZoomOut size={16} />
            </button>
            <span className="zoom-level">{Math.round(pageScale * 100)}%</span>
            <button
              onClick={handleZoomIn}
              className="btn-zoom"
              disabled={pageScale >= 3.0}
              title="Zoom in"
            >
              <IconZoomIn size={16} />
            </button>
          </div>
          <button
            onClick={() => setTextLayerVisible(!textLayerVisible)}
            className="btn-toolbar"
            title={textLayerVisible ? "Hide text layer" : "Show text layer"}
          >
            {textLayerVisible ? <IconEye size={16} /> : <IconEyeOff size={16} />}
          </button>
          
          <button
            onClick={handleReset}
            className="btn-toolbar"
            title="Close document"
          >
            <IconClose size={16} />
          </button>
        </div>
      </div>

      {/* Highlight Control Panel */}
      {interactionMode === 'highlight' && pdfDoc && !isMobile && !isSummaryExpanded && !isHighlightsExpanded && (
        <div className="highlight-control-panel">
          <div className="highlight-color-option">
            <button
              className={`highlight-color-btn ${highlightColor === 'yellow' ? 'active' : ''}`}
              onClick={() => setHighlightColor('yellow')}
              title="Yellow: Normal text"
              style={{ backgroundColor: 'rgba(251, 188, 4, 0.8)' }}
            />
            <span className="highlight-color-label">Aa</span>
          </div>
          <div className="highlight-color-option">
            <button
              className={`highlight-color-btn ${highlightColor === 'green' ? 'active' : ''}`}
              onClick={() => setHighlightColor('green')}
              title="Green: Bold H2 headers"
              style={{ backgroundColor: 'rgba(52, 168, 83, 0.8)' }}
            />
            <span className="highlight-color-label highlight-color-label-bold">Aa</span>
          </div>
          <div className="highlight-color-option">
            <button
              className={`highlight-color-btn ${highlightColor === 'blue' ? 'active' : ''}`}
              onClick={() => setHighlightColor('blue')}
              title="Blue: Bullet points"
              style={{ backgroundColor: 'rgba(66, 133, 244, 0.8)' }}
            />
            <span className="highlight-color-label">• Aa</span>
          </div>
        </div>
      )}

      {/* Main PDF Viewer Area */}
      <div className="reader-main">
        {/* Enhanced Sidebar with Tabs */}
        {pdfDoc && totalPages > 0 && !isMobile && (
          <div 
            className={`pdf-sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isResizing ? 'resizing' : ''} ${sidebarView === 'exhibits' && isExhibitsExpanded ? 'exhibits-expanded' : ''}`}
            style={{ width: isSidebarCollapsed ? '52px' : `${sidebarWidth}px` }}
          >
            {/* Sidebar Header with Tabs */}
            <div className="sidebar-header">
              <div className="sidebar-tabs">
                <button
                  className={`sidebar-tab ${sidebarView === 'pages' ? 'active' : ''}`}
                  onClick={() => setSidebarView('pages')}
                  title="Pages"
                >
                  <IconFileText size={18} />
                  {!isSidebarCollapsed && <span>Pages</span>}
                </button>
                <button
                  className={`sidebar-tab ${sidebarView === 'timeline' ? 'active' : ''}`}
                  onClick={() => setSidebarView('timeline')}
                  title="Timeline"
                >
                  <IconTimeline size={18} />
                  {!isSidebarCollapsed && <span>Timeline</span>}
                </button>
                <button
                  className={`sidebar-tab ${sidebarView === 'characters' ? 'active' : ''}`}
                  onClick={() => setSidebarView('characters')}
                  title="Characters"
                >
                  <IconUsers size={18} />
                  {!isSidebarCollapsed && <span>Characters</span>}
                </button>
                <button
                  className={`sidebar-tab ${sidebarView === 'chat' ? 'active' : ''}`}
                  onClick={() => setSidebarView('chat')}
                  title="Chat"
                >
                  <IconMessageCircle size={18} />
                  {!isSidebarCollapsed && <span>Chat</span>}
                </button>
                <button
                  className={`sidebar-tab ${sidebarView === 'highlights' ? 'active' : ''}`}
                  onClick={() => setSidebarView('highlights')}
                  title="Highlights"
                >
                  <IconHighlighter size={18} />
                  {!isSidebarCollapsed && <span>Highlights</span>}
                </button>
                <button
                  className={`sidebar-tab ${sidebarView === 'exhibits' ? 'active' : ''}`}
                  onClick={() => setSidebarView('exhibits')}
                  title="Exhibits Insights"
                >
                  <IconFileText size={18} />
                  {!isSidebarCollapsed && <span>Exhibits</span>}
                </button>
              </div>
              <button
                className="sidebar-toggle-btn"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isSidebarCollapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
              </button>
            </div>

            {/* Sidebar Content */}
            {!isSidebarCollapsed && (
              <div className="sidebar-content">
                {sidebarView === 'pages' && (
                  <PagesSidebar
                    totalPages={totalPages}
                    currentPage={currentPage}
                    scrollToPage={scrollToPage}
                    thumbnailRefs={thumbnailRefs}
                  />
                )}
                {sidebarView === 'timeline' && (
                  <TimelineSidebar
                    isPDFProcessing={isPDFProcessing}
                    isTimelineLoading={isTimelineLoading}
                    timelineError={timelineError}
                    documentId={documentId}
                    generateTimeline={generateTimeline}
                    timeline={timeline}
                    isTimelineExpanded={isTimelineExpanded}
                      setIsTimelineExpanded={(expanded) => {
                        // Save exact scroll position before opening full view
                        if (expanded) {
                          const pdfViewer = document.querySelector('.pdf-viewer-container')
                          if (pdfViewer) {
                            const scrollPos = getCurrentScrollPosition()
                            if (scrollPos) {
                              scrollPositionBeforeFullViewRef.current = {
                                ...scrollPos,
                                exactScrollTop: pdfViewer.scrollTop // Save exact scroll position
                              }
                            }
                          }
                        }
                        setIsTimelineExpanded(expanded)
                      }}
                    isSidebarCollapsed={isSidebarCollapsed}
                  />
                )}
                {sidebarView === 'characters' && (
                  <CharactersSidebar
                    isPDFProcessing={isPDFProcessing}
                    isCharactersLoading={isCharactersLoading}
                    charactersError={charactersError}
                    documentId={documentId}
                    generateCharacters={generateCharacters}
                    characters={characters}
                    isCharactersExpanded={isCharactersExpanded}
                    setIsCharactersExpanded={(expanded) => {
                      // Save exact scroll position before opening full view
                      if (expanded) {
                        const pdfViewer = document.querySelector('.pdf-viewer-container')
                        if (pdfViewer) {
                          const scrollPos = getCurrentScrollPosition()
                          if (scrollPos) {
                            scrollPositionBeforeFullViewRef.current = {
                              ...scrollPos,
                              exactScrollTop: pdfViewer.scrollTop // Save exact scroll position
                            }
                          }
                        }
                      }
                      setIsCharactersExpanded(expanded)
                    }}
                    isSidebarCollapsed={isSidebarCollapsed}
                  />
                )}
                {sidebarView === 'chat' && <ChatSidebar />}
                {sidebarView === 'exhibits' && (
                  <ExhibitsSidebar
                    extractedText={extractedText}
                    pdfDoc={pdfDoc}
                    documentId={documentId}
                    isPDFProcessing={isPDFProcessing}
                    pageData={pageData}
                    isExpanded={isExhibitsExpanded}
                    setIsExpanded={setIsExhibitsExpanded}
                    sidebarWidth={sidebarWidth}
                    setSidebarWidth={setSidebarWidth}
                    onExhibitClick={(exhibit) => {
                      // Don't scroll the PDF viewer - just show the exhibit in sidebar
                      // The sidebar will handle displaying the page
                    }}
                  />
                )}
                {sidebarView === 'highlights' && (
                  <HighlightsSidebar
                    highlightItems={highlightItems}
                    setHighlightItems={setHighlightItemsWithSave}
                    documentId={documentId}
                    highlights={highlights}
                    onColorChange={handleChangeHighlightColor}
                    onDelete={handleDeleteHighlight}
                    pdfFileName={pdfFile?.name}
                    summaryText={summaryText}
                    onDragStateChange={(isDragging) => {
                      isDraggingHighlightRef.current = isDragging
                    }}
                    onExpandSummary={() => {
                      // Save exact scroll position before opening full view
                      const pdfViewer = document.querySelector('.pdf-viewer-container')
                      if (pdfViewer) {
                        const scrollPos = getCurrentScrollPosition()
                        if (scrollPos) {
                          scrollPositionBeforeFullViewRef.current = {
                            ...scrollPos,
                            exactScrollTop: pdfViewer.scrollTop // Save exact scroll position
                          }
                        }
                      }
                      setIsSummaryExpanded(true)
                      setIsSidebarCollapsed(true)
                    }}
                    onExpandHighlights={() => {
                      // Save exact scroll position before opening full view
                      const pdfViewer = document.querySelector('.pdf-viewer-container')
                      if (pdfViewer) {
                        const scrollPos = getCurrentScrollPosition()
                        if (scrollPos) {
                          scrollPositionBeforeFullViewRef.current = {
                            ...scrollPos,
                            exactScrollTop: pdfViewer.scrollTop // Save exact scroll position
                          }
                        }
                      }
                      setIsHighlightsExpanded(true)
                      setIsSidebarCollapsed(true)
                    }}
                    onSummaryGenerated={(text) => {
                      setSummaryText(text)
                    }}
                  />
                )}
              </div>
            )}
            {/* Resize Handle */}
            {/* Always show resize handle when viewing exhibit, otherwise only when not collapsed */}
            {((sidebarView === 'exhibits' && isExhibitsExpanded) || !isSidebarCollapsed) && (
              <div
                className="sidebar-resize-handle"
                onMouseDown={handleResizeStart}
              />
            )}
          </div>
        )}
        
        {/* Main Content Area - Shows PDF, Timeline, Summary, or Highlights based on expanded state */}
        {isSummaryExpanded && summaryText ? (
          <SummaryFullView
            summaryText={summaryText}
            highlightItems={highlightItems}
            setHighlightItems={setHighlightItemsWithSave}
            documentId={documentId}
            highlights={highlights}
            onColorChange={handleChangeHighlightColor}
            onDelete={handleDeleteHighlight}
            pdfFileName={pdfFile?.name}
            onMinimize={() => {
              setIsSummaryExpanded(false)
              setIsSidebarCollapsed(false)
            }}
            onSummaryGenerated={async (text) => {
              setSummaryText(text)
              // Auto-save summary to Firestore
              await updateDocumentField('summary', text)
            }}
            onSummaryBlur={handleSummaryBlur}
          />
        ) : isHighlightsExpanded && highlightItems.length > 0 ? (
          <HighlightsFullView
            highlightItems={highlightItems}
            setHighlightItems={setHighlightItems}
            documentId={documentId}
            highlights={highlights}
            onColorChange={handleChangeHighlightColor}
            onDelete={handleDeleteHighlight}
            pdfFileName={pdfFile?.name}
            summaryText={summaryText}
            onMinimize={() => {
              setIsHighlightsExpanded(false)
              setIsSidebarCollapsed(false)
            }}
            onSummaryGenerated={async (text) => {
              setSummaryText(text)
              // Auto-save summary to Firestore
              await updateDocumentField('summary', text)
            }}
          />
        ) : isCharactersExpanded && characters && characters.characters && characters.characters.length > 0 ? (
          <CharactersFullView
            characters={characters}
            onMinimize={() => {
              setIsCharactersExpanded(false)
              setIsSidebarCollapsed(false)
            }}
          />
        ) : isTimelineExpanded && timeline && timeline.length > 0 ? (
          <div className="timeline-full-view">
            <div className="timeline-full-view-header">
              <div className="timeline-full-view-title">
                <IconTimeline size={24} />
                <h2>Story Timeline</h2>
                <span className="timeline-full-view-count">{timeline.length} events</span>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button
                  className="btn-back-to-pdf"
                  onClick={downloadTimelineAsHTML}
                  title="Download Timeline as HTML"
                >
                  <IconDownload size={18} />
                  <span>Download</span>
                </button>
                <button
                  className="btn-back-to-pdf"
                  onClick={() => setIsTimelineExpanded(false)}
                  title="Back to PDF"
                >
                  <IconChevronLeft size={18} />
                  <span>Back to PDF</span>
                </button>
              </div>
            </div>
            <div className="timeline-full-view-content">
              <ProportionalTimeline 
                events={timeline}
                selectedEvent={selectedEvent}
                onEventClick={setSelectedEvent}
                onCloseDetails={() => setSelectedEvent(null)}
                documentId={documentId}
                initialIcons={timelineIcons}
              />
            </div>
          </div>
        ) : (
          <div className="pdf-viewer-container">
          {error && (
            <div className="error-message error-floating">
              {error}
            </div>
          )}
          
          {/* TTS Loading Indicator */}
          {isTTSLoading && (
            <div className="tts-loading-overlay">
              <div className="tts-loading-content">
                <IconLoading size={24} />
                <p>Preparing audio...</p>
              </div>
            </div>
          )}

          {/* Floating "Jump to Current Reading" Button */}
          {(() => {
            const shouldShow = !autoScrollEnabled && (hasCurrentReadingPosition || isPlaying)
            if (shouldShow) {
              console.log('Button should show:', { autoScrollEnabled, hasCurrentReadingPosition, isPlaying })
            }
            return shouldShow ? (
              <button
                onClick={jumpToCurrentReading}
                className="floating-jump-button"
                title="Jump to current reading position"
                aria-label="Jump to current reading position"
              >
                <IconNavigation size={28} />
                <span>Follow Reading</span>
              </button>
            ) : null
          })()}

          <div className="pdf-pages-container">
            {/* Global connection overlay for cross-page connections */}
            <div
              ref={globalConnectionLayerRef}
              className="global-connection-layer"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 100
              }}
            />
            {isLoading && pageData.length === 0 && (
              <div className="loading-pages">
                <div className="spinner"></div>
                <p>Loading pages...</p>
              </div>
            )}
            {pageData.map((pageInfo) => {
              return (
                <div key={pageInfo.pageNum} className="pdf-page-wrapper" id={`page-${pageInfo.pageNum}`}>
                  <div 
                    className="pdf-canvas-wrapper"
                    style={{
                      aspectRatio: `${pageInfo.viewport.width} / ${pageInfo.viewport.height}`,
                      /* Removed maxWidth constraint to allow canvas to grow beyond container when zooming */
                    }}
                  >
                    <canvas
                      ref={(el) => {
                        if (el) canvasRefs.current[pageInfo.pageNum] = el
                      }}
                      className="pdf-canvas"
                    />
                    <div
                      ref={(el) => {
                        if (el) textLayerRefs.current[pageInfo.pageNum] = el
                      }}
                      className={`textLayer ${textLayerVisible ? 'text-layer-visible' : 'text-layer-hidden'}`}
                      style={{ opacity: textLayerVisible ? 1 : 0 }}
                    />
                    <div
                      ref={(el) => {
                        if (el) highlightLayerRefs.current[pageInfo.pageNum] = el
                      }}
                      className="highlight-layer"
                      style={{ opacity: 1, position: 'absolute', top: 0, left: 0 }}
                    />
                    <div
                      ref={(el) => {
                        if (el) connectionLayerRefs.current[pageInfo.pageNum] = el
                      }}
                      className="connection-layer"
                    />
                    <div
                      ref={(el) => {
                        if (el) tooltipLayerRefs.current[pageInfo.pageNum] = el
                      }}
                      className="tooltip-layer"
                    />
                    <div
                      ref={(el) => {
                        if (el) selectionLayerRefs.current[pageInfo.pageNum] = el
                      }}
                      className="selection-layer"
                    />
                    <div
                      ref={(el) => {
                        if (el) snipLayerRefs.current[pageInfo.pageNum] = el
                      }}
                      className="snip-layer"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: isSnippingMode ? 'auto' : 'none',
                        zIndex: 200
                      }}
                    />
                  </div>
                </div>
              )
            })}
            {!isLoading && pageData.length > 0 && renderedPages.length < pageData.length && (
              <div className="loading-pages">
                <div className="spinner"></div>
                <p>Rendering pages... {renderedPages.length} of {pageData.length}</p>
              </div>
            )}
          </div>
        </div>
        )}
        
      </div>

      {/* Mobile Bottom Controls Bar - Always Visible */}
      {pdfDoc && isMobile && (
        <div 
          className="mobile-bottom-controls"
          style={{ opacity: mobileControlsOpacity }}
          onTouchStart={() => setMobileControlsOpacity(1)}
          onClick={() => setMobileControlsOpacity(1)}
        >
          <div className="mobile-controls-content">
            <button
              onClick={handleRewind}
              className="mobile-control-btn mobile-rewind-btn"
              disabled={isLoading || !extractedText || startPosition === 0}
              aria-label="Rewind 10 seconds"
            >
              <IconRewind size={20} />
            </button>
            
            <button
              onClick={handlePlay}
              className={`mobile-control-btn mobile-play-btn ${isPlaying ? 'playing' : ''}`}
              disabled={isLoading || !extractedText}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <IconPause size={24} /> : <IconPlay size={24} />}
            </button>
            
            <button
              onClick={handleForward}
              className="mobile-control-btn mobile-forward-btn"
              disabled={isLoading || !extractedText || startPosition >= extractedText.length - 10}
              aria-label="Forward 10 seconds"
            >
              <IconForward size={20} />
            </button>

            {/* YouTube-style Speed Dropdown */}
            <div className="mobile-speed-dropdown" ref={speedDropdownRef}>
              <button
                className="mobile-control-btn mobile-speed-btn"
                onClick={() => setSpeedDropdownOpen(!speedDropdownOpen)}
                aria-label="Playback speed"
              >
                <span>{playbackSpeed.toFixed(1)}x</span>
              </button>
              {speedDropdownOpen && (
                <div className="speed-dropdown-menu">
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map((speed) => (
                    <button
                      key={speed}
                      className={`speed-option ${playbackSpeed === speed ? 'active' : ''}`}
                      onClick={() => {
                        const newSpeed = speed
                        setPlaybackSpeed(newSpeed)
                        setSpeedDropdownOpen(false)
                        // If currently playing, restart with new speed from current position
                        if (isPlaying) {
                          const currentPos = lastBoundaryPositionRef.current !== undefined 
                            ? lastBoundaryPositionRef.current 
                            : currentPlaybackPositionRef.current
                          
                          // Handle Google TTS (audio playback)
                          if (audioRef.current) {
                            // Stop audio and wait for it to fully stop
                            stopGoogleTTSAudio().then(() => {
                              // Double-check audio is stopped before restarting
                              if (!audioRef.current && !isPlayingRef.current) {
                                startPlaybackFromPosition(currentPos)
                              }
                            })
                          } 
                          // Handle browser TTS (speechSynthesis)
                          else if (synthRef.current) {
                            synthRef.current.cancel()
                            utteranceRef.current = null
                            setIsPlaying(false)
                            
                            setTimeout(() => {
                              if (!synthRef.current.speaking) {
                                startPlaybackFromPosition(currentPos)
                              }
                            }, 50)
                          }
                        }
                      }}
                    >
                      {speed === 1.0 ? 'Normal' : `${speed.toFixed(2)}x`}
                      {playbackSpeed === speed && <span className="checkmark">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Desktop Floating Controls Panel */}
      {pdfDoc && !isMobile && (
        <>
          {(isControlsPanelMinimized || isTimelineExpanded) ? (
            <div 
              className={`reader-controls-panel-minimized ${isHoveringMinimizedPanel ? 'hovered' : ''}`}
              onMouseEnter={() => setIsHoveringMinimizedPanel(true)}
              onMouseLeave={() => setIsHoveringMinimizedPanel(false)}
              onClick={() => {
                setIsControlsPanelMinimized(false)
                if (isTimelineExpanded) setIsTimelineExpanded(false)
              }}
            >
              <IconSpeaker size={16} />
            </div>
          ) : (
            <div className={`reader-controls-panel ${isTimelineExpanded ? 'timeline-expanded' : ''}`}>
              <div className="controls-panel-header">
                <button
                  className="panel-minimize-btn"
                  onClick={() => setIsControlsPanelMinimized(true)}
                  aria-label="Minimize controls"
                  title="Minimize"
                >
                  <IconMinimize size={12} />
                </button>
                <IconSpeaker size={18} />
                <span>Text-to-Speech</span>
                {isMobile && (
                  <button
                    className="panel-close-btn"
                    onClick={() => setControlsPanelExpanded(false)}
                    aria-label="Close controls"
                  >
                    <IconClose size={16} />
                  </button>
                )}
              </div>
          
          <div className="controls-panel-content">
            

            <div className="control-group">
              <label htmlFor="speed-slider">Speed: {playbackSpeed.toFixed(1)}x</label>
              <input
                id="speed-slider"
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={playbackSpeed}
                onChange={(e) => {
                  const newSpeed = parseFloat(e.target.value)
                  setPlaybackSpeed(newSpeed)
                  // If currently playing, restart with new speed from current position
                  if (isPlaying) {
                    // Use the most recent tracked position (from boundary events if available)
                    const currentPos = lastBoundaryPositionRef.current !== undefined 
                      ? lastBoundaryPositionRef.current 
                      : currentPlaybackPositionRef.current
                    
                    // Handle Google TTS (audio playback)
                    if (audioRef.current) {
                      // Stop audio and wait for it to fully stop
                      stopGoogleTTSAudio().then(() => {
                        // Double-check audio is stopped before restarting
                        if (!audioRef.current && !isPlayingRef.current) {
                          startPlaybackFromPosition(currentPos)
                        }
                      })
                    } 
                    // Handle browser TTS (speechSynthesis)
                    else if (synthRef.current) {
                      // Cancel current speech
                      synthRef.current.cancel()
                      utteranceRef.current = null
                      setIsPlaying(false)
                      
                      // Restart from current position with new speed after a brief delay
                      // This ensures the cancellation is complete before restarting
                      setTimeout(() => {
                        // Double-check we're still supposed to be playing (user might have stopped)
                        if (!synthRef.current.speaking) {
                          startPlaybackFromPosition(currentPos)
                        }
                      }, 50)
                    }
                  }
                }}
                className="speed-slider"
              />
              <div className="speed-labels">
                <span>0.5x</span>
                <span>1.0x</span>
                <span>2.0x</span>
              </div>
            </div>

            {interactionMode === 'read' && startPosition > 0 && (
              <div className="control-group">
                <div className="position-indicator-small">
                  Start: {startPosition.toLocaleString()}
                  <button 
                    onClick={handleResetStartPosition}
                    className="reset-position-btn-small"
                    title="Reset to start"
                    disabled={isPlaying}
                  >
                    <IconClose size={12} />
                  </button>
                </div>
              </div>
            )}

            

            <div className="control-group controls-buttons">
              <div className="playback-controls-row">
                <button
                  onClick={handleRewind}
                  className="btn btn-secondary btn-rewind-forward"
                  disabled={isLoading || !extractedText || startPosition === 0}
                  title="Rewind 10 seconds"
                >
                  <IconRewind size={16} />
                </button>
                <button
                  onClick={handlePlay}
                  className={`btn btn-primary btn-play ${isPlaying ? 'playing' : ''}`}
                  disabled={isLoading || !extractedText}
                >
                  {isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
                  <span>{isPlaying ? 'Pause' : 'Play'}</span>
                </button>
                <button
                  onClick={handleForward}
                  className="btn btn-secondary btn-rewind-forward"
                  disabled={isLoading || !extractedText || startPosition >= extractedText.length - 10}
                  title="Forward 10 seconds"
                >
                  <IconForward size={16} />
                </button>
              </div>
              
            </div>
          </div>

          {!extractedText && (
            <div className="controls-panel-hint">
              {isLoading ? 'Extracting text from PDF...' : 'No text extracted from PDF'}
            </div>
          )}

          {extractedText && interactionMode === 'read' && (
            <div className="controls-panel-hint">
              Click on anywhere in the text to start reading aloud
            </div>
          )}

          {extractedText && interactionMode === 'highlight' && highlights.length === 0 && (
            <div className="controls-panel-hint">
              Select text to create highlights
            </div>
          )}
          </div>
          )}
        </>
      )}
    </div>
  )
  }
}

export default Home
