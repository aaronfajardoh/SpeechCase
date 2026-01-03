import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument, rgb } from 'pdf-lib'
import './App.css'

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
  IconEyeOff
} from './components/Icons.jsx'
import ProportionalTimeline from './components/ProportionalTimeline.jsx'
import PagesSidebar from './components/PagesSidebar.jsx'
import TimelineSidebar from './components/TimelineSidebar.jsx'
import CharactersSidebar from './components/CharactersSidebar.jsx'
import ChatSidebar from './components/ChatSidebar.jsx'
import HighlightsSidebar from './components/HighlightsSidebar.jsx'
import SummaryFullView from './components/SummaryFullView.jsx'
import HighlightsFullView from './components/HighlightsFullView.jsx'

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

// Guards to prevent overlapping PDF render operations on the same canvases.
// Instead of skipping renders, we serialize them by awaiting the previous run.
// pdf.js throws "Cannot use the same canvas during multiple render() operations"
// if a second render starts before the first one finishes (e.g., on resize).
let renderPagesPromise = null
let renderThumbnailsPromise = null

function App() {
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfDoc, setPdfDoc] = useState(null)
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
  const [highlightHistory, setHighlightHistory] = useState([[]]) // History stack for undo/redo
  const [historyIndex, setHistoryIndex] = useState(0) // Current position in history
  const [interactionMode, setInteractionMode] = useState('read') // 'read' or 'highlight'
  const [highlightColor, setHighlightColor] = useState('yellow') // 'yellow', 'green', 'blue'
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
  const thumbnailRefs = useRef({}) // Store thumbnail canvas refs by page number
  const isDraggingSelectionRef = useRef(false) // Track if user is dragging to select
  const selectionStartRangeRef = useRef(null) // Store the start of selection range
  const lastValidRangeRef = useRef(null) // Track last valid range during mouse move (for whitespace handling)
  const [renderedThumbnails, setRenderedThumbnails] = useState([]) // Track which thumbnails are rendered
  const [sidebarView, setSidebarView] = useState('pages') // 'pages', 'timeline', 'characters', 'chat', 'highlights'
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false) // Sidebar collapsed state
  const [sidebarWidth, setSidebarWidth] = useState(230) // Sidebar width in pixels
  const [isResizing, setIsResizing] = useState(false) // Track if sidebar is being resized
  const isResizingRef = useRef(false) // Track if user is resizing the sidebar
  const resizeStartXRef = useRef(0) // Track initial mouse X position when resizing starts
  const resizeStartWidthRef = useRef(230) // Track initial sidebar width when resizing starts
  const normalSidebarWidthRef = useRef(230) // Store normal sidebar width before expansion
  const previousInteractionModeRef = useRef('read') // Track previous interaction mode to detect changes
  const sidebarWidthRef = useRef(230) // Track current sidebar width
  const isSidebarCollapsedRef = useRef(false) // Track current sidebar collapsed state
  const sidebarViewRef = useRef('pages') // Track current sidebar view
  const previousSidebarViewRef = useRef('pages') // Track previous sidebar view to detect changes
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
  const fileInputRef = useRef(null)
  const utteranceRef = useRef(null)
  const synthRef = useRef(null)
  const pdfArrayBufferRef = useRef(null) // Store original PDF array buffer
  const currentPlaybackPositionRef = useRef(0) // Track current playback position
  const playbackStartTimeRef = useRef(null) // Track when playback started
  const playbackStartPositionRef = useRef(0) // Track position when playback started
  const lastBoundaryPositionRef = useRef(0) // Track last known position from boundary events
  const isPlayingRef = useRef(false) // Track playing state for Media Session handlers
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

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Sidebar resize handlers
  const handleResizeStart = useCallback((e) => {
    if (isSidebarCollapsed) return
    e.preventDefault()
    isResizingRef.current = true
    setIsResizing(true) // Disable CSS transition during resize
    resizeStartXRef.current = e.clientX
    resizeStartWidthRef.current = sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [isSidebarCollapsed, sidebarWidth])

  const handleResizeMove = useCallback((e) => {
    if (!isResizingRef.current) return
    const deltaX = e.clientX - resizeStartXRef.current
    const newWidth = Math.max(220, Math.min(500, resizeStartWidthRef.current + deltaX))
    setSidebarWidth(newWidth)
    
    // Update normal width if not on highlights tab (preserve original normal width when on highlights)
    if (sidebarView !== 'highlights') {
      normalSidebarWidthRef.current = newWidth
    }
  }, [sidebarView])

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
  }, [pdfDoc, totalPages, isHighlightsExpanded, isSummaryExpanded, isTimelineExpanded])

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

      // Use Google TTS for Spanish, browser TTS for English
      console.log('Media Session: Starting playback, language:', langToUse, 'text length:', textToRead.length)
      if (langToUse === 'es') {
        // Use Google TTS for Spanish
        console.log('Media Session: Using Google TTS for Spanish text')
        try {
          const success = await playGoogleTTSAudio(textToRead, position, playbackSpeedRef.current)
          console.log('Media Session: Google TTS playback started:', success)
          return success
        } catch (error) {
          console.error('Media Session: Google TTS error:', error)
          setError('Error with Google TTS: ' + error.message)
          return false
        }
      } else {
        console.log('Media Session: Using browser TTS for', langToUse === 'es' ? 'Spanish' : 'English', 'text')
        // Use browser TTS for English
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
          utterance.lang = 'en-US'
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
    try {
      const { filterHeadersAndFooters } = await import('./services/pdfProcessing/footerFilter.js')
      return await filterHeadersAndFooters(pageData, textToPages, {
        minRepetitions
      })
    } catch (error) {
      console.warn('Footer filtering failed, using sync version:', error)
      return filterHeadersAndFootersSync(pageData, textToPages, minRepetitions)
    }
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
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, rate, documentId }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Google TTS API error:', response.status, errorData)
        throw new Error(errorData.error || `Failed to synthesize speech: ${response.status}`)
      }

      const data = await response.json()
      if (data.audioChunks) {
        console.log('Google TTS API success, received', data.audioChunks.length, 'audio chunks')
      } else {
        console.log('Google TTS API success, audio length:', data.audioContent?.length)
      }
      return data
    } catch (error) {
      console.error('Google TTS error:', error)
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
        let remainingChunks = []
        if (remainingText.length > 0) {
          try {
            const chunksResponse = await fetch('/api/tts/chunks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: remainingText }),
            })
            
            if (chunksResponse.ok) {
              const { chunks } = await chunksResponse.json()
              remainingChunks = chunks
              console.log(`Remaining text split into ${chunks.length} chunks`)
            } else {
              console.error('Failed to get remaining chunks, will process as single chunk')
              remainingChunks = [remainingText] // Fallback: treat remaining as one chunk
            }
          } catch (err) {
            console.error('Error getting remaining chunks:', err)
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

  const renderPages = async () => {
    if (!pdfDoc || pageData.length === 0) return

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
      for (const pageInfo of pageData) {
        const { pageNum, viewport, pageCharOffset, textContent } = pageInfo
        const canvas = canvasRefs.current[pageNum]
        const textLayerDiv = textLayerRefs.current[pageNum]
        const highlightLayerDiv = highlightLayerRefs.current[pageNum]

        if (!canvas || !textLayerDiv) continue

        // Render canvas
        const page = await pdfDoc.getPage(pageNum)
        const viewportObj = page.getViewport({ scale: pageScale })
        const context = canvas.getContext('2d')
        
        // Set internal dimensions to match viewport (for crisp rendering at the desired scale)
        canvas.height = viewportObj.height
        canvas.width = viewportObj.width
        
        // Set CSS dimensions to match internal dimensions exactly to prevent blurry CSS scaling
        // The container will handle overflow with scrolling if the canvas is larger
        canvas.style.width = viewportObj.width + 'px'
        canvas.style.height = viewportObj.height + 'px'

        await page.render({
          canvasContext: context,
          viewport: viewportObj
        }).promise

        // Wait for canvas to be laid out
        await new Promise(resolve => requestAnimationFrame(resolve))

        // Set highlight layer dimensions to match canvas display size
        if (highlightLayerDiv) {
          const canvasRect = canvas.getBoundingClientRect()
          highlightLayerDiv.style.width = canvasRect.width + 'px'
          highlightLayerDiv.style.height = canvasRect.height + 'px'
          
          const textLayerDiv = textLayerRefs.current[pageNum]
          const parentContainer = highlightLayerDiv.parentElement
        }
        
        // Set connection layer dimensions to match canvas display size
        const connectionLayerDiv = connectionLayerRefs.current[pageNum]
        if (connectionLayerDiv) {
          const canvasRect = canvas.getBoundingClientRect()
          connectionLayerDiv.style.width = canvasRect.width + 'px'
          connectionLayerDiv.style.height = canvasRect.height + 'px'
        }
        
        // Set selection layer dimensions to match canvas display size
        const selectionLayerDiv = selectionLayerRefs.current[pageNum]
        if (selectionLayerDiv) {
          const canvasRect = canvas.getBoundingClientRect()
          selectionLayerDiv.style.width = canvasRect.width + 'px'
          selectionLayerDiv.style.height = canvasRect.height + 'px'
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

    // Serialize thumbnail renders to avoid overlapping operations on the same canvas
    if (renderThumbnailsPromise) {
      try {
        await renderThumbnailsPromise
      } catch (e) {
        console.error('Previous renderThumbnails run failed, continuing with new render:', e)
      }
    }

    const run = async () => {
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

        const page = await pdfDoc.getPage(pageNum)
        const viewport = page.getViewport({ scale: thumbnailScale })
        const context = thumbnailCanvas.getContext('2d')
        
        // Set canvas dimensions
        thumbnailCanvas.width = viewport.width
        thumbnailCanvas.height = viewport.height
        
        // Render the page
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise

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

    // Calculate the scale ratio between canvas internal size and displayed size
    // This ensures text layer scales correctly on mobile when canvas is scaled by CSS
    const canvasRect = canvas.getBoundingClientRect()
    const canvasWidth = canvas.width
    const canvasHeight = canvas.height
    const displayedWidth = canvasRect.width
    const displayedHeight = canvasRect.height
    
    // Calculate scale factors (should be the same for both X and Y if aspect ratio is maintained)
    const scaleX = displayedWidth / canvasWidth
    const scaleY = displayedHeight / canvasHeight

    // Set text layer dimensions to match canvas display size
    textLayerDiv.style.width = displayedWidth + 'px'
    textLayerDiv.style.height = displayedHeight + 'px'

    // Build text position mapping
    // CRITICAL: extractedText is built from filteredItems in PDF.js extraction order,
    // but we render items in visual order (Y then X). We need to map each item to its
    // actual position in extractedText.
    const pageTextItems = []
    
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
    
    let charIndex = 0
    let isFirstItem = true

    // Pre-process items to group by line and calculate line-level justification factors
    // This handles cases where justification spans multiple items on the same line
    // First, collect all items with their positions
    const allItems = []
    textContent.items.forEach((item, itemIndex) => {
      // Only process items that will actually be rendered (non-empty after trimming)
      const trimmedStr = item.str ? item.str.trim() : ''
      if (trimmedStr.length === 0) {
        return
      }
      
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
      const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3])
      const fontSize = fontHeight * scaleY
      const itemWidth = measureTextWidth(trimmedStr, item.fontName, fontSize)
      const baseY = tx[5] * scaleY
      
      allItems.push({ 
        item, 
        itemIndex, 
        tx, 
        baseX: tx[4] * scaleX,
        baseY,
        trimmedStr,
        fontName: item.fontName,
        fontSize,
        itemWidth
      })
    })
    
    // Helper function to detect if an item is a drop cap
    // A drop cap is typically a single letter with dramatically larger font size
    const isDropCap = (item, allItems) => {
      const itemText = item.trimmedStr
      
      // Check if item is a single character (or very short, like 1-2 chars)
      // and is a letter (not punctuation or number)
      if (itemText.length > 2 || !/[a-zA-ZÀ-ÿ]/.test(itemText)) {
        return false
      }
      
      // Calculate median font size of all items to compare
      // This is more robust than average, as it's less affected by outliers
      const fontSizes = allItems.map(i => i.fontSize).sort((a, b) => a - b)
      const medianFontSize = fontSizes.length > 0 
        ? fontSizes[Math.floor(fontSizes.length / 2)]
        : item.fontSize
      
      // Also check average of items excluding potential drop caps (items with font size > 2x median)
      let sumFontSize = 0
      let count = 0
      for (const otherItem of allItems) {
        // Only include items that are likely normal text (not other drop caps)
        if (otherItem.fontSize <= medianFontSize * 2.5) {
          sumFontSize += otherItem.fontSize
          count++
        }
      }
      
      if (count === 0) return false
      
      const avgNormalFontSize = sumFontSize / count
      
      // If item's font size is at least 2x larger than average of normal text items,
      // it's likely a drop cap
      return item.fontSize >= avgNormalFontSize * 2
    }
    
    // Detect and filter out drop caps (large first letters)
    // Check all items to find drop caps anywhere in the text
    const itemsToRemove = []
    for (let i = 0; i < allItems.length; i++) {
      if (isDropCap(allItems[i], allItems)) {
        itemsToRemove.push(i)
      }
    }
    
    // Remove drop caps from allItems (iterate backwards to maintain indices)
    for (let i = itemsToRemove.length - 1; i >= 0; i--) {
      allItems.splice(itemsToRemove[i], 1)
    }
    
    // First, cluster items by Y coordinate only
    // Then split by columns (X position gaps) within each Y group
    const itemsByY = new Map()
    const lineTolerance = 5 * scaleY // Scale tolerance with display scale
    
    // Step 1: Group by Y coordinate
    allItems.forEach(itemData => {
      let assignedY = null
      for (const [y, items] of itemsByY.entries()) {
        if (Math.abs(y - itemData.baseY) < lineTolerance) {
          assignedY = y
          break
        }
      }
      
      if (assignedY === null) {
        assignedY = itemData.baseY
        itemsByY.set(assignedY, [])
      }
      itemsByY.get(assignedY).push(itemData)
    })
    
    // Step 2: Split each Y group by columns (X position gaps)
    // First pass: detect potential gaps on each line and record them
    const lineGapData = [] // Array of { y, items, gaps } where gaps is array of { gapX, gapEndX }
    const sortedYPositions = Array.from(itemsByY.keys()).sort((a, b) => a - b)
    
    sortedYPositions.forEach(y => {
      const yItems = itemsByY.get(y)
      // Sort items by X position
      yItems.sort((a, b) => a.baseX - b.baseX)
      
      // Calculate line-specific font size metrics for threshold calculation
      // This accounts for different font sizes within the same line (e.g., different columns)
      const lineFontSizes = yItems.map(item => item.fontSize)
      const lineMedianFontSize = lineFontSizes.length > 0
        ? lineFontSizes.sort((a, b) => a - b)[Math.floor(lineFontSizes.length / 2)]
        : 12 // fallback
      
      // Detect potential gaps on this line
      const gaps = []
      for (let i = 1; i < yItems.length; i++) {
        const prevItem = yItems[i - 1]
        const currentItem = yItems[i]
        const prevItemEndX = prevItem.baseX + prevItem.itemWidth
        const gap = currentItem.baseX - prevItemEndX
        
        // Calculate gap threshold based on font sizes of items around the gap
        // CRITICAL: If font sizes differ significantly, this is a strong signal of different columns
        // Use the font size of the item on the RIGHT (currentItem) for threshold when sizes differ
        // This prevents large-font left columns from incorrectly grouping with small-font right columns
        const prevFontSize = prevItem.fontSize
        const currentFontSize = currentItem.fontSize
        const fontSizeDiff = Math.abs(prevFontSize - currentFontSize)
        const fontSizeRatio = Math.max(prevFontSize, currentFontSize) / Math.min(prevFontSize, currentFontSize)
        
        // If font sizes differ significantly (>30% or >3px), use the RIGHT column's font size for threshold
        // This ensures we detect column boundaries even when the left column has much larger font
        const isSignificantFontDiff = fontSizeRatio > 1.3 || fontSizeDiff > 3
        
        let thresholdBase
        if (isSignificantFontDiff) {
          // Use the RIGHT column's font size (currentItem) for threshold when sizes differ significantly
          // This makes the threshold more sensitive to gaps when columns have different font sizes
          thresholdBase = Math.max(lineMedianFontSize, currentFontSize)
        } else {
          // Font sizes are similar - use the maximum as before
          const maxFontSizeAroundGap = Math.max(prevFontSize, currentFontSize)
          thresholdBase = Math.max(lineMedianFontSize, maxFontSizeAroundGap)
        }
        
        const columnGapThreshold = thresholdBase * 0.5
        
        // If font sizes differ significantly, also lower the threshold to be more sensitive
        // This helps detect column boundaries even with smaller gaps
        const adjustedThreshold = isSignificantFontDiff 
          ? columnGapThreshold * 0.7  // 30% lower threshold when font sizes differ
          : columnGapThreshold
        
        if (gap > adjustedThreshold) {
          // Record this gap position (use the X position where the gap starts)
          // Also store font size difference info for more lenient validation when sizes differ
          gaps.push({ 
            gapX: prevItemEndX, 
            gapEndX: currentItem.baseX, 
            gapSize: gap,
            isSignificantFontDiff,
            prevFontSize,
            currentFontSize
          })
        }
      }
      
      lineGapData.push({ y, items: yItems, gaps, lineMedianFontSize })
    })
    
    // Second pass: Find gaps that appear consistently across 3+ consecutive lines
    // A gap is considered consistent if it appears at a similar X position across lines
    // This ensures column boundaries are only validated when they persist across multiple lines
    const validatedGapBoundaries = [] // Array of { minX, maxX } representing validated column boundaries
    
    // Track consecutive lines with similar gap patterns
    // A column boundary is only validated if it appears in at least 3 consecutive lines
    for (let i = 0; i < lineGapData.length; i++) {
      const currentLine = lineGapData[i]
      
      // For each gap on the current line, check if it appears in 3+ consecutive lines
      // CRITICAL: If font sizes differ significantly, require only 2+ consecutive lines instead of 3+
      currentLine.gaps.forEach(gap => {
        let consecutiveCount = 1
        let minGapX = gap.gapX
        let maxGapX = gap.gapEndX
        const linesWithGap = [i] // Track which lines have this gap
        // Track the average gap position to prevent boundary drift
        let avgGapX = gap.gapX
        let gapCount = 1
        // Check if this gap has significant font size difference (more lenient validation)
        const hasSignificantFontDiff = gap.isSignificantFontDiff || false
        const requiredConsecutiveLines = hasSignificantFontDiff ? 2 : 3
        // For gaps with font size differences, track average END position (more stable than start)
        let avgGapEndX = gap.gapEndX
        
        // Check forward to see how many consecutive lines have a similar gap
        for (let j = i + 1; j < lineGapData.length; j++) {
          const nextLine = lineGapData[j]
          let foundSimilarGap = false
          
          // Calculate font-size-aware tolerance based on the font sizes of the lines being compared
          // Use the larger of the two line's median font sizes
          const toleranceBase = Math.max(currentLine.lineMedianFontSize || 12, nextLine.lineMedianFontSize || 12)
          const gapTolerance = toleranceBase * 0.3 // 30% of font size for tolerance
          
          for (const nextGap of nextLine.gaps) {
            // Check if this gap is at a similar X position (within font-size-aware tolerance)
            // CRITICAL: Check against the AVERAGE gap position of all matching gaps so far
            // This prevents boundaries from expanding too wide by keeping the reference point stable
            const xDiff = Math.abs(nextGap.gapX - avgGapX)
            const nextGapCenter = (nextGap.gapX + nextGap.gapEndX) / 2
            const currentGapCenter = (minGapX + maxGapX) / 2
            const centerDiff = Math.abs(nextGapCenter - currentGapCenter)
            
            // For gaps with significant font size differences, use wider tolerance
            // This accounts for varying gap positions when columns have different font sizes
            const effectiveTolerance = (hasSignificantFontDiff && nextGap.isSignificantFontDiff) 
              ? gapTolerance * 2.0  // Double tolerance when both gaps have font size differences
              : gapTolerance
            
            // CRITICAL: When font sizes differ significantly, also check if gaps END at similar positions
            // This catches cases where gaps have different start positions but same end position
            // (indicating they all lead to the same column boundary)
            let endPositionMatch = false
            if (hasSignificantFontDiff && nextGap.isSignificantFontDiff) {
              const endXDiff = Math.abs(nextGap.gapEndX - avgGapEndX)
              // If gaps end at roughly the same position (within tolerance), they're the same boundary
              // Use a wider tolerance for end positions since they should be more consistent
              const endTolerance = gapTolerance * 3.0
              endPositionMatch = endXDiff < endTolerance
            }
            
            // Gap matches if it's within tolerance of the average gap position OR ends at similar position
            if (xDiff < effectiveTolerance || centerDiff < effectiveTolerance || endPositionMatch) {
              consecutiveCount++
              gapCount++
              // Update average gap position (running average)
              avgGapX = (avgGapX * (gapCount - 1) + nextGap.gapX) / gapCount
              // Also update average end position for font-size-different gaps
              if (hasSignificantFontDiff && nextGap.isSignificantFontDiff) {
                avgGapEndX = (avgGapEndX * (gapCount - 1) + nextGap.gapEndX) / gapCount
              }
              // Only expand boundary if the gap is within a reasonable range
              // Use a tighter expansion tolerance to prevent excessive widening
              const expansionTolerance = gapTolerance * 2
              if (nextGap.gapX >= avgGapX - expansionTolerance && nextGap.gapX <= avgGapX + expansionTolerance) {
                minGapX = Math.min(minGapX, nextGap.gapX)
                maxGapX = Math.max(maxGapX, nextGap.gapEndX)
              }
              linesWithGap.push(j)
              foundSimilarGap = true
              
              break
            }
          }
          
          if (!foundSimilarGap) {
            break // Gap pattern broken, stop checking consecutive lines
          }
        }
        
        // CRITICAL: For gaps with significant font size differences, use alternative validation
        // Instead of requiring consecutive lines, validate if:
        // 1. The gap is large enough (relative to the smaller font size)
        // 2. There are other gaps with font size differences ending at similar positions
        let shouldValidate = false
        if (hasSignificantFontDiff && consecutiveCount < requiredConsecutiveLines) {
          // Check if gap is large enough relative to the smaller font size
          const smallerFontSize = Math.min(gap.prevFontSize || 12, gap.currentFontSize || 12)
          const gapSizeThreshold = smallerFontSize * 2.0 // Gap should be at least 2x the smaller font size
          
          if (gap.gapSize >= gapSizeThreshold) {
            // Also check if there are other gaps with font size differences ending at similar positions
            // Look for gaps in nearby lines that end at similar X positions
            let similarEndPositionCount = 1 // Count this gap
            const endPositionTolerance = smallerFontSize * 1.5
            
            for (let k = 0; k < lineGapData.length; k++) {
              if (k === i) continue // Skip current line
              const otherLine = lineGapData[k]
              for (const otherGap of otherLine.gaps) {
                if (otherGap.isSignificantFontDiff) {
                  const endXDiff = Math.abs(otherGap.gapEndX - gap.gapEndX)
                  if (endXDiff < endPositionTolerance) {
                    similarEndPositionCount++
                  }
                }
              }
            }
            
            // Validate if we found 2+ gaps with font size differences ending at similar positions
            // OR if the gap is very large (3x smaller font size)
            const isVeryLargeGap = gap.gapSize >= smallerFontSize * 3.0
            shouldValidate = similarEndPositionCount >= 2 || isVeryLargeGap
          }
        }
        
        // Only add gap as column boundary if it appears in required consecutive lines
        // OR if it passes alternative validation for font-size-different gaps
        // Use 2+ lines for gaps with significant font size differences, 3+ otherwise
        if (consecutiveCount >= requiredConsecutiveLines || shouldValidate) {
          // Calculate font-size-aware tolerance for merging boundaries
          // Use the median font size from the lines that have this gap
          const gapLinesFontSizes = linesWithGap.map(idx => lineGapData[idx].lineMedianFontSize || 12)
          const gapLinesMedianFont = gapLinesFontSizes.sort((a, b) => a - b)[Math.floor(gapLinesFontSizes.length / 2)]
          const mergeTolerance = gapLinesMedianFont * 0.3
          
          // Check if this gap boundary already exists (merge if close)
          let merged = false
          for (const boundary of validatedGapBoundaries) {
            if ((minGapX >= boundary.minX - mergeTolerance && minGapX <= boundary.maxX + mergeTolerance) ||
                (maxGapX >= boundary.minX - mergeTolerance && maxGapX <= boundary.maxX + mergeTolerance) ||
                (boundary.minX >= minGapX - mergeTolerance && boundary.minX <= maxGapX + mergeTolerance)) {
              // Merge boundaries
              boundary.minX = Math.min(boundary.minX, minGapX)
              boundary.maxX = Math.max(boundary.maxX, maxGapX)
              merged = true
              break
            }
          }
          
          if (!merged) {
            validatedGapBoundaries.push({ minX: minGapX, maxX: maxGapX })
          }
        }
      })
    }
    
    // Sort validated boundaries by X position
    validatedGapBoundaries.sort((a, b) => a.minX - b.minX)
    
    // Third pass: Split items by validated column boundaries only
    const itemsByLine = new Map()
    const allColumnXPositions = [] // Collect X positions of all detected columns
    
    lineGapData.forEach(({ y, items, lineMedianFontSize }) => {
      // Split items by validated gap boundaries
      const columns = []
      let currentColumn = [items[0]]
      
      // Calculate font-size-aware tolerance for this line
      const lineTolerance = (lineMedianFontSize || 12) * 0.3
      
      for (let i = 1; i < items.length; i++) {
        const prevItem = items[i - 1]
        const currentItem = items[i]
        const prevItemEndX = prevItem.baseX + prevItem.itemWidth
        const gapStartX = prevItemEndX
        const gapEndX = currentItem.baseX
        
        // Check if this gap matches any validated boundary
        let isColumnBoundary = false
        for (const boundary of validatedGapBoundaries) {
          // Check if gap overlaps with validated boundary (using font-size-aware tolerance)
          // A gap matches if:
          // 1. The gap start is within the boundary range (with tolerance)
          // 2. The gap end is within the boundary range (with tolerance)
          // 3. The gap completely spans the boundary
          // 4. The gap center is within the boundary range (for better matching of gaps that are close but not exact)
          const gapCenter = (gapStartX + gapEndX) / 2
          const boundaryCenter = (boundary.minX + boundary.maxX) / 2
          
          const startInBoundary = (gapStartX >= boundary.minX - lineTolerance && gapStartX <= boundary.maxX + lineTolerance)
          const endInBoundary = (gapEndX >= boundary.minX - lineTolerance && gapEndX <= boundary.maxX + lineTolerance)
          const spansBoundary = (gapStartX <= boundary.minX && gapEndX >= boundary.maxX)
          const centerInBoundary = (gapCenter >= boundary.minX - lineTolerance && gapCenter <= boundary.maxX + lineTolerance)
          
          if (startInBoundary || endInBoundary || spansBoundary || centerInBoundary) {
            isColumnBoundary = true
            break
          }
        }
        
        if (isColumnBoundary) {
          // Validated column boundary - start a new column
          columns.push(currentColumn)
          currentColumn = [currentItem]
        } else {
          // Not a validated boundary - same column
          currentColumn.push(currentItem)
        }
      }
      columns.push(currentColumn) // Don't forget the last column
      
      // Store columns temporarily and collect their X positions
      columns.forEach((columnItems) => {
        const firstItemX = columnItems[0]?.baseX
        if (firstItemX !== undefined) {
          allColumnXPositions.push(firstItemX)
        }
      })
      
      // Store columns with temporary local indices
      columns.forEach((columnItems, localColumnIndex) => {
        const lineKey = `${y}_${localColumnIndex}`
        itemsByLine.set(lineKey, { items: columnItems, localIndex: localColumnIndex })
      })
    })
    
    // Determine global column boundaries by clustering X positions
    // Sort all X positions and find natural clusters (columns)
    allColumnXPositions.sort((a, b) => a - b)
    const globalColumnBoundaries = []
    const xTolerance = 50 // X positions within 50px are considered the same column
    
    allColumnXPositions.forEach(x => {
      // Find if this X position belongs to an existing global column
      let assignedToColumn = false
      for (let i = 0; i < globalColumnBoundaries.length; i++) {
        const boundary = globalColumnBoundaries[i]
        // Check if X is within tolerance of this column's range
        if (x >= boundary.minX - xTolerance && x <= boundary.maxX + xTolerance) {
          // Update boundary to include this X
          boundary.minX = Math.min(boundary.minX, x)
          boundary.maxX = Math.max(boundary.maxX, x)
          assignedToColumn = true
          break
        }
      }
      
      if (!assignedToColumn) {
        // Create new global column boundary
        globalColumnBoundaries.push({ minX: x, maxX: x, globalIndex: globalColumnBoundaries.length })
      }
    })
    
    // Sort global columns by X position
    globalColumnBoundaries.sort((a, b) => a.minX - b.minX)
    // Reassign global indices based on sorted order
    globalColumnBoundaries.forEach((boundary, index) => {
      boundary.globalIndex = index
    })
    
    // Helper function to find global column index for a given X position
    const getGlobalColumnIndex = (x) => {
      for (const boundary of globalColumnBoundaries) {
        if (x >= boundary.minX - xTolerance && x <= boundary.maxX + xTolerance) {
          return boundary.globalIndex
        }
      }
      // Fallback: find closest column
      let closestIndex = 0
      let minDistance = Infinity
      globalColumnBoundaries.forEach((boundary, index) => {
        const distance = Math.min(Math.abs(x - boundary.minX), Math.abs(x - boundary.maxX))
        if (distance < minDistance) {
          minDistance = distance
          closestIndex = index
        }
      })
      return closestIndex
    }
    
    // Second pass: update itemsByLine with global column indices
    const itemsByLineWithGlobalColumns = new Map()
    itemsByLine.forEach((value, lineKey) => {
      const { items, localIndex } = value
      const firstItemX = items[0]?.baseX
      const globalColumnIndex = firstItemX !== undefined ? getGlobalColumnIndex(firstItemX) : 0
      // Use composite key: Y_globalColumnIndex
      const newLineKey = `${lineKey.split('_')[0]}_${globalColumnIndex}`
      
      // CRITICAL FIX: If multiple lines map to the same key, merge them instead of overwriting
      // This happens when items at the same Y position are split into different columns
      // but then map back to the same global column index
      if (itemsByLineWithGlobalColumns.has(newLineKey)) {
        // Merge with existing items (sort by X position to maintain order)
        const existingItems = itemsByLineWithGlobalColumns.get(newLineKey)
        const mergedItems = [...existingItems, ...items].sort((a, b) => a.baseX - b.baseX)
        itemsByLineWithGlobalColumns.set(newLineKey, mergedItems)
      } else {
        itemsByLineWithGlobalColumns.set(newLineKey, items)
      }
    })
    
    // Replace itemsByLine with the version using global column indices
    itemsByLine.clear()
    itemsByLineWithGlobalColumns.forEach((items, key) => {
      itemsByLine.set(key, items)
    })
    
    
    // Calculate spacing factors for each line
    const lineSpacingFactors = new Map()
    itemsByLine.forEach((lineItems, lineY) => {
      // Sort items by X position to ensure correct order
      lineItems.sort((a, b) => a.baseX - b.baseX)
      
      if (lineItems.length < 2) {
        // Single item on line - still need to store line end in case item needs to stretch
        const singleItem = lineItems[0]
        const singleItemLineEnd = singleItem.baseX + singleItem.itemWidth
        lineItems.forEach(({ itemIndex, itemWidth }) => {
          lineSpacingFactors.set(itemIndex, 1.0)
          lineSpacingFactors.set(`width_${itemIndex}`, itemWidth)
          // Store line end for single-item lines too (in case item needs to stretch)
          lineSpacingFactors.set(`end_${itemIndex}`, singleItemLineEnd)
        })
        return
      }
      
      // Calculate total actual width (from leftmost item start to rightmost item end)
      const leftmostItem = lineItems[0]
      const rightmostItem = lineItems[lineItems.length - 1]
      // Actual line width = rightmost item end - leftmost item start
      const actualLineWidth = (rightmostItem.baseX + rightmostItem.itemWidth) - leftmostItem.baseX
      
      // Calculate total measured width of all items on the line
      let totalMeasuredWidth = 0
      lineItems.forEach(({ itemWidth }) => {
        totalMeasuredWidth += itemWidth
      })
      
      // Calculate gaps between items (Hypothesis A, E)
      let totalGaps = 0
      for (let i = 0; i < lineItems.length - 1; i++) {
        const currentItem = lineItems[i]
        const nextItem = lineItems[i + 1]
        const gap = nextItem.baseX - (currentItem.baseX + currentItem.itemWidth)
        totalGaps += gap
      }
      
      // Calculate spacing factor for this line
      // This factor will stretch all characters/spaces proportionally to match PDF justification
      const spacingFactor = totalMeasuredWidth > 0 ? actualLineWidth / totalMeasuredWidth : 1.0
      const lineRightmostEnd = rightmostItem.baseX + rightmostItem.itemWidth
      
      // Log line end calculation details to verify correctness
      
      
      // Store both spacing factor and line end position for each item
      // Also store the item's natural width (from line grouping calculation) for accurate spacing
      // Store which line each item belongs to, and the next item on the same line
      lineItems.forEach(({ itemIndex, itemWidth }, idx) => {
        lineSpacingFactors.set(itemIndex, spacingFactor)
        // Store item's natural width (calculated during line grouping) for accurate spacing calculation
        lineSpacingFactors.set(`width_${itemIndex}`, itemWidth)
        // Store line end position for the rightmost item (last on line)
        if (idx === lineItems.length - 1) {
          lineSpacingFactors.set(`end_${itemIndex}`, lineRightmostEnd)
        }
        // Store the next item on the same line (for accurate item end positioning)
        if (idx < lineItems.length - 1) {
          const nextItemOnLine = lineItems[idx + 1]
          lineSpacingFactors.set(`next_${itemIndex}`, nextItemOnLine.itemIndex)
        }
      })
    })

    // Create canvas context for measuring text
    const tempCanvas = document.createElement('canvas')
    const tempContext = tempCanvas.getContext('2d')

    // NEW APPROACH: Line-based rendering with justified spacing
    // For each line, measure its width in the PDF and render all words with spacing to match
    // Sort by Y position (first part of composite key), then by column index (second part)
    const sortedLines = Array.from(itemsByLine.entries()).sort((a, b) => {
      const [aY, aCol] = a[0].split('_').map(Number)
      const [bY, bCol] = b[0].split('_').map(Number)
      if (aY !== bY) return aY - bY // Sort by Y first
      return aCol - bCol // Then by column index
    })
    
    sortedLines.forEach(([lineY, lineItems], lineIndex) => {
      // Sort items by X position to ensure correct order
      lineItems.sort((a, b) => a.baseX - b.baseX)
      
      if (lineItems.length === 0) return
      
      // Calculate line width from PDF positions
      const leftmostItem = lineItems[0]
      const rightmostItem = lineItems[lineItems.length - 1]
      const lineStartX = leftmostItem.baseX
      
      // Find the actual line end position
      // For justified text, the PDF applies spacing, so measured width might not match actual end
      // We need to find where the rightmost item actually ends in the PDF
      let lineEndX = rightmostItem.baseX + rightmostItem.itemWidth // Fallback to measured width
      
      // For justified text, we can infer the right margin from the next line's start position
      // if the next line starts at the same X as the current line (same left margin)
      // IMPORTANT: Only compare with lines in the same column (same column index in key)
      const [currentY, currentCol] = lineY.split('_').map(Number)
      
      if (lineIndex < sortedLines.length - 1) {
        // Find the next line in the same column (not just the next line overall)
        let nextLineInSameColumn = null
        for (let i = lineIndex + 1; i < sortedLines.length; i++) {
          const [nextLineKey, nextLineItems] = sortedLines[i]
          const [nextY, nextCol] = nextLineKey.split('_').map(Number)
          
          // Check if it's in the same column
          if (nextCol === currentCol) {
            nextLineInSameColumn = { key: nextLineKey, items: nextLineItems }
            break
          }
          
          // If we've moved to a different Y position significantly, stop searching
          if (nextY > currentY + lineTolerance * 2) {
            break
          }
        }
        
        if (nextLineInSameColumn && nextLineInSameColumn.items && nextLineInSameColumn.items.length > 0) {
          const nextLineItems = nextLineInSameColumn.items
          nextLineItems.sort((a, b) => a.baseX - b.baseX)
          const nextLineFirstItem = nextLineItems[0]
          const nextLineStartX = nextLineFirstItem.baseX
          
          // If next line starts at roughly the same X as current line (same left margin),
          // then for justified text, the current line should end at the right margin
          // The right margin can be inferred from the pattern: if lines are justified,
          // they should all have the same width
          // So we can use: rightMargin = leftMargin + (average line width from other lines)
          // OR: we can look at the rightmost item's actual end by checking if there's
          // a gap before the next line starts
          
          // Actually, a simpler approach: for justified text, find the maximum X position
          // where any line's rightmost item ends, and use that as the right margin
          // But for now, let's try using the next line's start as a hint
          // If the next line starts at the same X, the current line should end at the right margin
          // We can estimate the right margin by looking at the pattern of line widths
          
          // For now, let's try a different approach: measure the actual end of the rightmost item
          // by looking at where the next item would be if it were on the same line
          // But since it's the rightmost, we need to find the right margin
          
          // Actually, the simplest fix: for justified text, the line should extend to where
          // the text would naturally end if it were stretched. We can calculate this by
          // finding the maximum X position of all items on the line, then adding the
          // measured width of the rightmost item, but accounting for justification spacing
          
          // Check if next line starts at same left margin (same paragraph/column)
          const xDiff = Math.abs(nextLineStartX - lineStartX)
          if (xDiff < 10) {
            // Next line starts at same left margin - could be justified or left-aligned
            // First, calculate the current line's measured width
            const currentLineMeasuredWidth = rightmostItem.baseX + rightmostItem.itemWidth - lineStartX
            
            // Find the maximum line width by looking at nearby lines
            let maxLineWidth = currentLineMeasuredWidth
            
            // Look at a few lines ahead to find the maximum line width
            // IMPORTANT: Only consider lines in the same column
            // CRITICAL: Also constrain maxLineWidth to the column's right boundary
            let columnRightBoundary = Infinity // No boundary by default
            
            // Find the column's right boundary from validated gap boundaries
            // The right boundary is the minX of the next validated boundary after this column's start
            for (const boundary of validatedGapBoundaries) {
              // If this boundary starts after the line start, it's the right boundary for this column
              if (boundary.minX > lineStartX + 10) { // Add small tolerance
                columnRightBoundary = Math.min(columnRightBoundary, boundary.minX)
              }
            }
            
            for (let i = lineIndex; i < Math.min(lineIndex + 10, sortedLines.length); i++) {
              const [checkLineKey, checkLineItems] = sortedLines[i]
              const [checkY, checkCol] = checkLineKey.split('_').map(Number)
              
              // Only consider lines in the same column
              if (checkCol === currentCol && checkLineItems && checkLineItems.length > 0) {
                checkLineItems.sort((a, b) => a.baseX - b.baseX)
                const checkLeftmost = checkLineItems[0]
                const checkRightmost = checkLineItems[checkLineItems.length - 1]
                
                // Only consider lines that start at roughly the same X (same left margin)
                if (Math.abs(checkLeftmost.baseX - lineStartX) < 10) {
                  const checkLineWidth = (checkRightmost.baseX + checkRightmost.itemWidth) - checkLeftmost.baseX
                  // Constrain to column boundary if available
                  const constrainedWidth = columnRightBoundary < Infinity 
                    ? Math.min(checkLineWidth, columnRightBoundary - lineStartX)
                    : checkLineWidth
                  maxLineWidth = Math.max(maxLineWidth, constrainedWidth)
                }
              }
            }
            
            // Also constrain maxLineWidth to column boundary
            if (columnRightBoundary < Infinity) {
              const originalMaxLineWidth = maxLineWidth
              maxLineWidth = Math.min(maxLineWidth, columnRightBoundary - lineStartX)
            }
            
            // Determine if this line is justified by checking:
            // 1. Is the current line itself close to max width?
            // 2. Is it part of a justified paragraph pattern?
            // We prioritize individual line check to avoid stretching left-aligned lines
            const widthDiff = maxLineWidth - currentLineMeasuredWidth
            const widthRatio = maxLineWidth > 0 ? currentLineMeasuredWidth / maxLineWidth : 1.0
            
            // Primary check: Is the current line itself close to max width?
            // Use stricter threshold: line must be within 92% of max OR within 15px
            const isCurrentLineJustified = widthRatio >= 0.92 || widthDiff < 15
            
            // Secondary check: Is this part of a justified paragraph?
            // Only use this if the current line is already close to max (to maintain consistency)
            let isJustifiedParagraph = false
            if (isCurrentLineJustified) {
              // Only check paragraph pattern if current line is already close to max
              // This prevents stretching isolated short lines
              let justifiedLineCount = 0
              let totalLineCount = 0
              const justifiedThreshold = 0.92 // 92% of max width indicates justification
              
              // Analyze nearby lines to determine if this is a justified paragraph
              // IMPORTANT: Only consider lines in the same column
              for (let i = lineIndex; i < Math.min(lineIndex + 10, sortedLines.length); i++) {
                const [checkLineKey, checkLineItems] = sortedLines[i]
                const [checkY, checkCol] = checkLineKey.split('_').map(Number)
                
                // Only consider lines in the same column
                if (checkCol === currentCol && checkLineItems && checkLineItems.length > 0) {
                  checkLineItems.sort((a, b) => a.baseX - b.baseX)
                  const checkLeftmost = checkLineItems[0]
                  const checkRightmost = checkLineItems[checkLineItems.length - 1]
                  
                  // Only consider lines that start at roughly the same X (same left margin)
                  if (Math.abs(checkLeftmost.baseX - lineStartX) < 10) {
                    totalLineCount++
                    const checkLineWidth = (checkRightmost.baseX + checkRightmost.itemWidth) - checkLeftmost.baseX
                    const checkWidthRatio = maxLineWidth > 0 ? checkLineWidth / maxLineWidth : 1.0
                    
                    // If this line is close to max width, it's likely justified
                    if (checkWidthRatio >= justifiedThreshold) {
                      justifiedLineCount++
                    }
                  }
                }
              }
              
              // If most lines (>=60%) are close to max width, the paragraph is justified
              // Use higher threshold (60% instead of 50%) to be more conservative
              isJustifiedParagraph = totalLineCount > 0 && (justifiedLineCount / totalLineCount) >= 0.6
            }
            
            if (isCurrentLineJustified && isJustifiedParagraph) {
              // This line is close to max AND part of a justified paragraph - use maximum line end position
              lineEndX = lineStartX + maxLineWidth
            } else if (isCurrentLineJustified && widthRatio >= 0.95) {
              // This line is very close to max (>=95%) even if not in a justified paragraph pattern
              // Use max width to maintain consistency
              lineEndX = lineStartX + maxLineWidth
            } else {
              // This line is significantly shorter (e.g., header, last line of paragraph)
              // Use the actual measured end position
              lineEndX = rightmostItem.baseX + rightmostItem.itemWidth
            }
          }
        }
      }
      
      const lineWidth = lineEndX - lineStartX
      
      // Apply final constraint to lineEndX if needed to respect column boundaries
      let finalColumnRightBoundary = Infinity
      for (const boundary of validatedGapBoundaries) {
        if (boundary.minX > lineStartX + 10) {
          finalColumnRightBoundary = Math.min(finalColumnRightBoundary, boundary.minX)
        }
      }
      if (finalColumnRightBoundary < Infinity && lineEndX > finalColumnRightBoundary) {
        lineEndX = finalColumnRightBoundary
      }
      
      // Calculate final line width after column boundary constraint
      const finalLineWidth = lineEndX - lineStartX
      
      // Log line width calculation for debugging
      if (lineIndex < 5) { // Log first 5 lines
      }
      
      // Get line Y position and font properties
      // Skip drop caps when determining font size - use first non-drop-cap item
      let firstItemData = null
      let firstTx = null
      
      // Find first item that's not a drop cap
      for (const itemData of lineItems) {
        const itemText = itemData.trimmedStr
        // Quick check: if it's a single letter and font size is much larger than others on the line, skip it
        const isLikelyDropCap = itemText.length <= 2 && /[a-zA-ZÀ-ÿ]/.test(itemText)
        if (isLikelyDropCap) {
          // Calculate average font size of other items on this line
          let sumFontSize = 0
          let count = 0
          for (const otherItem of lineItems) {
            if (otherItem !== itemData) {
              sumFontSize += otherItem.fontSize
              count++
            }
          }
          if (count > 0 && itemData.fontSize >= (sumFontSize / count) * 2) {
            continue // Skip this drop cap
          }
        }
        firstItemData = itemData
        firstTx = itemData.tx
        break
      }
      
      // Fallback to first item if no non-drop-cap found
      if (!firstItemData) {
        firstItemData = lineItems[0]
        firstTx = firstItemData.tx
      }
      
      const angle = Math.atan2(firstTx[1], firstTx[0])
      const fontHeight = Math.sqrt(firstTx[2] * firstTx[2] + firstTx[3] * firstTx[3])
      const fontSize = fontHeight * scaleY
      const fontFamily = firstItemData.fontName
      const ascentRatio = 0.8
      const baseY = (firstTx[5] - fontHeight * ascentRatio) * scaleY
      
      // Filter out drop caps from lineItems before processing words
      const filteredLineItems = lineItems.filter(itemData => {
        const itemText = itemData.trimmedStr
        const isLikelyDropCap = itemText.length <= 2 && /[a-zA-ZÀ-ÿ]/.test(itemText)
        if (isLikelyDropCap) {
          // Calculate average font size of other items on this line
          let sumFontSize = 0
          let count = 0
          for (const otherItem of lineItems) {
            if (otherItem !== itemData) {
              sumFontSize += otherItem.fontSize
              count++
            }
          }
          if (count > 0 && itemData.fontSize >= (sumFontSize / count) * 2) {
            return false // Filter out this drop cap
          }
        }
        return true // Keep this item
      })
      
      // Collect all words from all items on this line (excluding drop caps)
      const lineWords = []
      let lineCharIndex = pageCharOffset + charIndex
      
      filteredLineItems.forEach((itemData, itemIdx) => {
        const trimmedStr = itemData.trimmedStr
        
        // Look up the charIndex for this item from the map using its original index
        // itemData.itemIndex is the index in textContent.items (unfiltered PDF.js order)
        // If this item was filtered out, it won't have a charIndex in extractedText
        let itemCharIndex = itemIndexToCharIndex.get(itemData.itemIndex)
        if (itemCharIndex === undefined) {
          // This item was filtered out - assign -1 to indicate it's not in extractedText
          // It will still be rendered but won't be part of TTS/highlighting
          itemCharIndex = -1
        }
        
        lineCharIndex = itemCharIndex
        
        // Split item text into words and spaces
        // CRITICAL: Don't split items that have spaces between characters - these are likely malformed PDF extractions
        // Instead, treat the entire trimmed string as a single "word" to preserve the text
        const words = []
        
        // Check if this item has spaces between characters (malformed PDF extraction)
        // Pattern: if item has many single characters separated by spaces, don't split it
        const hasSpacesBetweenChars = trimmedStr.length > 3 && /^(\S\s)+\S?$/.test(trimmedStr.trim())
        
        if (hasSpacesBetweenChars) {
          // Malformed item with spaces between characters - treat as single word
          // Remove internal spaces to normalize it
          const normalizedWord = trimmedStr.replace(/\s+/g, '')
          if (normalizedWord.length > 0) {
            words.push(normalizedWord)
          }
        } else {
          // Normal item - split into words and spaces as before
          let currentWord = ''
          for (let i = 0; i < trimmedStr.length; i++) {
            const char = trimmedStr[i]
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
        }
        
        // Add words to line words array with their char indices
        // CRITICAL: extractedText is built by joining trimmed items with spaces, not words
        // So words within an item should have charIndex based on the item's position in extractedText
        // The item's position is at lineCharIndex, and words are substrings of the item
        // If lineCharIndex is -1, this item was filtered out and won't have a charIndex in extractedText
        const itemStartCharIndex = lineCharIndex
        let wordOffsetInItem = 0
        words.forEach(word => {
          const wordCharIndex = itemStartCharIndex >= 0 ? itemStartCharIndex + wordOffsetInItem : -1
          lineWords.push({
            word,
            charIndex: wordCharIndex,
            itemIndex: itemData.itemIndex
          })
          wordOffsetInItem += word.length
        })
        
        // charIndex is now calculated from the map, so we don't need to update it sequentially
        // But we still track it for fallback cases
        // The item's charIndex is already set in lineCharIndex from the map lookup above
      })
      
      // Calculate natural width of all words (without spacing)
      tempContext.font = `${fontSize}px ${fontFamily}`
      let naturalWidth = 0
      lineWords.forEach(({ word }) => {
        naturalWidth += tempContext.measureText(word).width
      })
      
      // Calculate spacing to match line width exactly
      // For justified text, distribute extra space between words
      const wordTokens = lineWords.filter(w => /\w/.test(w.word))
      const wordCount = wordTokens.length
      const spaceCount = wordCount > 1 ? wordCount - 1 : 0
      // CRITICAL: Use finalLineWidth (constrained by column boundary) instead of lineWidth
      // This prevents lines from extending beyond their column boundaries
      const effectiveLineWidth = typeof finalLineWidth !== 'undefined' ? finalLineWidth : lineWidth
      const extraWidth = effectiveLineWidth - naturalWidth
      const spacingPerGap = spaceCount > 0 ? extraWidth / spaceCount : 0
      
      // Create container for the entire line
      const lineContainer = document.createElement('span')
      lineContainer.style.position = 'absolute'
      lineContainer.style.left = lineStartX + 'px'
      lineContainer.style.top = baseY + 'px'
      lineContainer.style.fontSize = fontSize + 'px'
      lineContainer.style.fontFamily = fontFamily
      lineContainer.style.transform = `rotate(${angle}rad)`
      lineContainer.style.whiteSpace = 'pre'
      lineContainer.style.display = 'inline-block'
      lineContainer.style.overflow = 'visible'
      // Store column index on line container for column-aware highlighting
      lineContainer.dataset.columnIndex = currentCol
      
      // Render all words in the line container with spacing
      let wordTokenIndex = 0
      lineWords.forEach(({ word, charIndex: wordCharIndex, itemIndex }, wordIdx) => {
        const span = document.createElement('span')
        span.textContent = word
        span.style.position = 'relative'
        span.style.display = 'inline'
        span.style.color = 'rgba(255, 0, 0, 0.5)'
        span.style.backgroundColor = 'rgba(255, 255, 0, 0.2)'
        span.style.cursor = interactionMode === 'highlight' ? 'text' : 'pointer'
        span.style.userSelect = interactionMode === 'highlight' ? 'text' : 'none'
        span.style.pointerEvents = interactionMode === 'highlight' ? 'auto' : 'auto'
        span.dataset.page = pageNum
        // Only set charIndex if the item is in extractedText (not filtered)
        // Items with charIndex -1 were filtered out and won't be part of TTS/highlighting
        if (wordCharIndex >= 0) {
          span.dataset.charIndex = wordCharIndex
        }
        // Store column index on span for column-aware highlighting
        span.dataset.columnIndex = currentCol
        
        if (!/\S/.test(word)) {
          span.classList.add('text-space')
        }
        
        // Add spacing after word tokens (not after punctuation or spaces)
        // This distributes the extra width between words for justification
        if (/\w/.test(word) && wordTokenIndex < wordCount - 1 && spacingPerGap > 0) {
          span.style.marginRight = spacingPerGap + 'px'
          wordTokenIndex++
        }
        
        // Only add to pageTextItems if the item is in extractedText (has valid charIndex >= 0)
        // Filtered items are still rendered but not added to textItems for TTS/highlighting
        if (wordCharIndex >= 0) {
          const textItem = {
            str: word,
            page: pageNum,
            charIndex: wordCharIndex,
            element: span
          }
          pageTextItems.push(textItem)
          
          span.addEventListener('click', (e) => {
            if (interactionMode === 'read') {
              e.preventDefault()
              if (/\S/.test(word)) {
                handleWordClick(textItem.charIndex, word, textItem.element)
              } else {
                const nextWordStart = findWordStart(extractedText, textItem.charIndex + word.length)
                handleWordClick(nextWordStart, word)
              }
            }
          })
        }
        // Filtered items are still rendered visually but won't have click handlers for TTS
        
        lineContainer.appendChild(span)
      })
      
      textLayerDiv.appendChild(lineContainer)
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
  const findWordSpans = (position) => {
    if (!extractedText || position < 0 || position >= extractedText.length) {
      return []
    }

    // Find word boundaries
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

    // Get all text items that overlap with this word
    const currentTextItems = textItemsRef.current
    if (!currentTextItems || currentTextItems.length === 0) {
      return []
    }

    const wordSpans = []
    currentTextItems.forEach(item => {
      if (!item.element || !item.element.isConnected) return
      
      const itemStart = item.charIndex
      const itemEnd = item.charIndex + item.str.length
      
      // Check if this item overlaps with the word
      if (itemStart < wordEnd && itemEnd > wordStart) {
        wordSpans.push(item.element)
      }
    })

    return wordSpans
  }

  // Helper function to get bounding box for multiple elements relative to their container
  const getCombinedBoundingBox = (elements) => {
    if (elements.length === 0) return null

    // Find the common container (text layer or page wrapper)
    const firstElement = elements[0]
    if (!firstElement || !firstElement.isConnected) return null

    const container = firstElement.closest('.text-layer') || firstElement.closest('.pdf-canvas-wrapper') || firstElement.closest('.pdf-page-wrapper')
    if (!container) return null

    const containerRect = container.getBoundingClientRect()
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    elements.forEach(element => {
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
  const applyReadingHighlight = (element, isPageTransition = false) => {
    // Clear previous reading highlight (but preserve blue start marker if it's on a different element)
    const previousElement = currentReadingElementRef.current
    const previousPage = previousElement ? getElementPageNumber(previousElement) : null
    
    // If isPageTransition is not provided, detect it from page change
    if (!isPageTransition && previousPage !== null) {
      const elementPage = getElementPageNumber(element)
      isPageTransition = elementPage !== null && elementPage !== previousPage
    }
    
    // Get the character index of the current element
    const charIndex = element.dataset.charIndex ? parseInt(element.dataset.charIndex) : null
    if (charIndex === null) {
      // Fallback to old behavior if no charIndex
      clearReadingHighlight()
      element.classList.add('current-reading-marker')
      currentReadingElementRef.current = element
      setHasCurrentReadingPosition(true)
      return
    }

    // Find all spans that belong to the current word
    const wordSpans = findWordSpans(charIndex)
    
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
      const boundingBox = getCombinedBoundingBox(wordSpans)
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

  const handleFileChange = async (event) => {
    const file = event.target.files[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.')
      return
    }

    setError('')
    clearStartMarker()
    clearReadingHighlight()
    setPdfFile(file)
    setIsLoading(true)
    setExtractedText('')
    setTextItems([])
    setCurrentPage(1)
    setTotalPages(0)
    setStartPosition(0)
    setHighlights([])
    setHighlightItems([])
    setHighlightColor('yellow') // Reset to yellow when uploading a new PDF

    try {
      const arrayBuffer = await file.arrayBuffer()
      // Clone the ArrayBuffer to prevent it from being detached when PDF.js uses it
      pdfArrayBufferRef.current = arrayBuffer.slice(0)
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      setPdfDoc(pdf)
      setTotalPages(pdf.numPages)
      setHighlights([]) // Clear highlights when loading new PDF
      setHighlightItems([]) // Clear highlight items when loading new PDF
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

      // Process PDF for AI features (chunking and embeddings)
      if (initialText && initialText.length > 0) {
        const newDocumentId = `${file.name}-${Date.now()}`
        setDocumentId(newDocumentId)
        setTimeline(null) // Clear previous timeline
        setTimelineError(null)
        setTimelineIcons({}) // Clear previous icons
        setIsPDFProcessing(true)
        
        // Process PDF in background (don't block UI)
        processPDFForAI(newDocumentId, initialText, {
          fileName: file.name,
          pageCount: pdf.numPages,
          textLength: initialText.length
        }).then(() => {
          setIsPDFProcessing(false)
        }).catch(err => {
          console.error('Error processing PDF for AI:', err)
          setIsPDFProcessing(false)
          // Don't show error to user - AI features will just be unavailable
        })
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

  // Process PDF for AI features (chunking and embeddings)
  const processPDFForAI = async (docId, text, metadata) => {
    try {
      const response = await fetch('/api/ai/process-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: docId,
          text: text,
          metadata: metadata
        })
      })

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json()
        } catch (jsonError) {
          // If response is not valid JSON, create a generic error
          const statusText = response.statusText || 'Unknown error'
          throw new Error(`Failed to process PDF: ${response.status} ${statusText}`)
        }
        throw new Error(errorData.error || errorData.details || 'Failed to process PDF')
      }

      const result = await response.json()
      console.log('PDF processed for AI:', result)
      return result
    } catch (error) {
      console.error('Error processing PDF for AI:', error)
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
      const response = await fetch('/api/ai/timeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: documentId,
          force: force
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        // If document not found and we haven't retried much, wait and retry
        if (errorData.error && errorData.error.includes('not found') && retryCount < 5) {
          setTimeout(() => {
            generateTimeline(retryCount + 1)
          }, 1000) // Wait 1 second and retry
          return
        }
        throw new Error(errorData.error || 'Failed to generate timeline')
      }

      const data = await response.json()
      
      if (!data.success) {
        // Couldn't generate timeline
        console.log('Timeline generation failed:', data);
        setTimelineError(data.message || 'Could not generate timeline from this document.')
        setTimeline(null)
        setTimelineIcons({})
        return
      }

      setTimeline(data.timeline || [])
      
      // If icons are included in the response, store them
      if (data.icons && Object.keys(data.icons).length > 0) {
        console.log(`Timeline loaded with ${Object.keys(data.icons).length} pre-generated icons`)
        setTimelineIcons(data.icons)
      } else {
        setTimelineIcons({}) // Clear icons if none provided
      }
    } catch (error) {
      console.error('Error generating timeline:', error)
      setTimelineError(error.message || 'Failed to generate timeline')
      setTimeline(null)
      setTimelineIcons({})
    } finally {
      setIsTimelineLoading(false)
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
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
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

    // Use Google TTS for Spanish, browser TTS for English
    console.log('Starting playback, language:', langToUse, 'text length:', textToRead.length)
    if (langToUse === 'es') {
      // Use Google TTS for Spanish
      console.log('Using Google TTS for Spanish text')
      try {
        const success = await playGoogleTTSAudio(textToRead, position, playbackSpeed)
        console.log('Google TTS playback started:', success)
        return success
      } catch (error) {
        console.error('Google TTS error:', error)
        setError('Error with Google TTS: ' + error.message)
        return false
      }
    } else {
      console.log('Using browser TTS for', langToUse === 'es' ? 'Spanish' : 'English', 'text')
      // Use browser TTS for English
      if (!synthRef.current) {
        setError('Text-to-speech is not available in your browser.')
        return false
      }

      // Reset speech synthesis state to fix Chrome issues
      await resetSpeechSynthesis()
      
      // Check if speech synthesis is ready
      if (!isSpeechSynthesisReady()) {
        setError('Speech synthesis is not ready. Please try again.')
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
            const textItems = textItemsRef.current
            if (!textItems || textItems.length === 0) {
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
            console.log('[TTS Boundary] No forward word items found', {
              startCharIndex,
              currentPage,
              isAtPageBoundary,
              lastHighlightedCharIndex: lastHighlightedCharIndexRef.current
            })
            return // No forward word items (end of text or end of page)
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
            
            // Directly highlight the element that TTS identified
            applyReadingHighlight(targetItem.element, isPageTransition)
          }
        }
      }

        utterance.onstart = () => {
          utteranceStarted = true
          if (utteranceStartTimeout) {
            clearTimeout(utteranceStartTimeout)
            utteranceStartTimeout = null
          }
          
          // Only set playing state and initialize on first segment
          if (currentSegmentIndex === 0) {
            setIsPlaying(true)
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
              utteranceRef.current = null
              clearReadingHighlight()
            }
          }, 500)
        } catch (error) {
          console.error('Error calling speech synthesis speak():', error)
          setError('Error starting speech: ' + error.message)
          utteranceRef.current = null
          setIsPlaying(false)
          return false
        }
      }
      
      // Start speaking the first segment
      speakNextSegment()
      return true
    }
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
        synthRef.current.cancel()
        utteranceRef.current = null
      }
      
      setIsPlaying(false)
      isPlayingRef.current = false
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

  // Helper function to extract column index from a selection range
  const getColumnIndexFromRange = (range) => {
    if (!range) return null
    
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
        // Get span position - use getBoundingClientRect if inline styles are not available
        let spanLeft = parseFloat(span.style.left)
        let spanTop = parseFloat(span.style.top)
        
        // Get font size - try inline style first, then computed style, then bounding rect height
        let spanHeight = parseFloat(span.style.fontSize)
        let spanRect = null
        
        // If inline styles are empty, use getBoundingClientRect to calculate relative position
        if (isNaN(spanLeft) || isNaN(spanTop) || span.style.left === '' || span.style.top === '') {
          spanRect = span.getBoundingClientRect()
          spanLeft = spanRect.left - textLayerRect.left
          spanTop = spanRect.top - textLayerRect.top
          // Also get actual height from bounding rect if fontSize is not available
          if (isNaN(spanHeight) || span.style.fontSize === '') {
            spanHeight = spanRect.height
          }
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
      // Calculate the start position of the first span's selected portion
      const firstTextBefore = firstSpan.textNode.textContent.substring(0, firstSpan.startOffset)
      const firstTextBeforeWidth = measureTextWidth(firstTextBefore, firstSpan.fontFamily, firstSpan.fontSize)
      const firstStartX = firstSpan.spanLeft + firstTextBeforeWidth
      
      // Calculate the end position of the last span's selected portion
      const lastSelectedText = lastSpan.textNode.textContent.substring(lastSpan.startOffset, lastSpan.endOffset)
      const lastTextBefore = lastSpan.textNode.textContent.substring(0, lastSpan.startOffset)
      const lastTextBeforeWidth = measureTextWidth(lastTextBefore, lastSpan.fontFamily, lastSpan.fontSize)
      const lastSelectedWidth = measureTextWidth(lastSelectedText, lastSpan.fontFamily, lastSpan.fontSize)
      const lastEndX = lastSpan.spanLeft + lastTextBeforeWidth + lastSelectedWidth
      
      // For all spans in the group, calculate their full end positions to find the maximum
      // This ensures we include spaces and any gaps between spans
      let maxEndX = lastEndX
      
      spanGroup.forEach(spanInfo => {
        // Calculate the end position of this span's selected portion
        const selectedText = spanInfo.textNode.textContent.substring(spanInfo.startOffset, spanInfo.endOffset)
        const textBefore = spanInfo.textNode.textContent.substring(0, spanInfo.startOffset)
        const textBeforeWidth = measureTextWidth(textBefore, spanInfo.fontFamily, spanInfo.fontSize)
        const selectedWidth = measureTextWidth(selectedText, spanInfo.fontFamily, spanInfo.fontSize)
        const spanEndX = spanInfo.spanLeft + textBeforeWidth + selectedWidth
        
        if (spanEndX > maxEndX) {
          maxEndX = spanEndX
        }
      })
      
      // The total width is from the start of the first selection to the end of the last
      const totalWidth = maxEndX - firstStartX
      
      // Use the maximum fontSize from the group
      const maxFontSize = Math.max(...spanGroup.map(s => s.fontSize))
      
      return {
        x: firstStartX,
        y: firstSpan.spanTop,
        width: totalWidth,
        height: maxFontSize
      }
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
    
    return rects.length > 0 ? rects : null
  }

  // Handle text selection to create highlights (only in highlight mode)
  useEffect(() => {
    if (interactionMode !== 'highlight') {
      // Clear selection overlay when not in highlight mode
      Object.values(selectionLayerRefs.current).forEach(layer => {
        if (layer) layer.innerHTML = ''
      })
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

      // Get highlight color
      const highlightBgColor = getHighlightColor(highlightColor)

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
      
      const textLayer = ancestorElement?.closest('.text-layer')
      
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
          const span = element.closest('.text-layer span')
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
      // Don't handle if clicking on a highlight (let highlights handle their own events)
      if (e.target.closest('.highlight-rect, .highlight-connection-dot')) {
        return
      }
      
      // Only handle if clicking directly on a text span (not through a highlight)
      const clickedElement = e.target
      if (!clickedElement.classList.contains('text-layer') && 
          !clickedElement.closest('.text-layer span')) {
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
        const textLayer = commonAncestor.closest('.text-layer')
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
        const textLayer = commonAncestor.closest('.text-layer')
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
      
      // Clear native selection after capturing (we use custom overlay for display)
      nativeSelection.removeAllRanges()
      
      if (selectedText.length === 0) {
        // Clear selection overlay
        Object.values(selectionLayerRefs.current).forEach(layer => {
          if (layer) layer.innerHTML = ''
        })
        isDraggingSelectionRef.current = false
        selectionStartRangeRef.current = null
        return
      }
      
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
        const columnIndex = getColumnIndexFromRange(selectionRange)
        
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
          return newHighlights
        })
        
        // Add to highlight items for sidebar (with expanded text)
        setHighlightItems(prev => {
          const newItem = {
            id: highlight.id,
            text: selectedText.trim(), // Full words in the highlights-editor
            color: highlightColor,
            order: prev.length
          }
          return [...prev, newItem]
        })
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

      // Clear selection overlay and reset state
      Object.values(selectionLayerRefs.current).forEach(layer => {
        if (layer) layer.innerHTML = ''
      })

      isDraggingSelectionRef.current = false
      selectionStartRangeRef.current = null
      lastValidRangeRef.current = null
    }

    // Add event listeners
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [textItems, pageData, pageScale, interactionMode, highlightColor])

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
    const textLayers = document.querySelectorAll('.text-layer')
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

      const canvasRect = canvas.getBoundingClientRect()
      const canvasWidth = canvas.width
      const canvasHeight = canvas.height
      const displayedWidth = canvasRect.width
      const displayedHeight = canvasRect.height
      
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
      return updated
    })
    // Update highlightItems color
    setHighlightItems(prev => {
      return prev.map(item => {
        if (item.id === highlightId) {
          return { ...item, color: newColor }
        }
        return item
      })
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
      return filtered
    })
    // Remove from highlightItems
    setHighlightItems(prev => {
      return prev.filter(item => item.id !== highlightId)
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
      
      // Find the maximum order value from existing items to assign to new items
      const maxExistingOrder = prev.length > 0 
        ? Math.max(...prev.map(item => item.order ?? 0), -1)
        : -1
      
      // Track new items to assign sequential order values
      let newItemCounter = 0
      
      // Update existing items with new text/color, add new ones
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
              return { ...mergedItem, text: combinedText, order: existingByMergedId.order ?? mergedItem.order }
            }
          }
          // Always preserve text and order from existing item (user's manual edits and custom order)
          return { ...mergedItem, text: existingByMergedId.text, order: existingByMergedId.order ?? mergedItem.order }
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
              // Use the order from the first item (the one with the merged item's ID)
              const firstItem = existingItems.find(item => item.id === mergedItem.id) || existingItems[0]
              const existingOrder = firstItem.order ?? mergedItem.order
              return { ...mergedItem, text: combinedText, order: existingOrder }
            }
            // Single existing item - preserve its text and order
            const existingText = existingItems[0].text
            const existingOrder = existingItems[0].order ?? mergedItem.order
            return { ...mergedItem, text: existingText, order: existingOrder }
          }
        } else {
          // For non-merged items, preserve existing text and order if available
          const existing = prev.find(item => item.id === mergedItem.id)
          if (existing) {
            return { ...mergedItem, text: existing.text, order: existing.order ?? mergedItem.order }
          }
        }
        // For new items, assign order after all existing items (increment for each new item)
        const newOrder = maxExistingOrder + 1 + newItemCounter
        newItemCounter++
        return { ...mergedItem, order: newOrder }
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
      return filtered.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
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
    // Use canvas directly for faster updates - canvas dimensions update immediately on resize
    const canvasRect = canvas.getBoundingClientRect()
    const currentCanvasDisplayedWidth = canvasRect.width
    const currentCanvasDisplayedHeight = canvasRect.height
    
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
      const baseHeight = rect.height * scaleRatioY
      // Add 15-20% padding, with a minimum of 2px for small fonts and scaling for larger fonts
      const paddingRatio = Math.max(0.15, Math.min(0.20, 0.15 + (baseHeight / 100) * 0.05))
      const height = baseHeight * (1 + paddingRatio)

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

  // Render upload mode (when no PDF is loaded)
  if (!pdfDoc) {
    return (
      <div className="app app-upload">
        <div className="container container-upload">
          <header className="header">
            <div className="header-logo">
              <img src="/logo.png" alt="SpeechCase" className="logo" />
            </div>
            <h1>SpeechCase</h1>
            <p>Upload a PDF and listen to it with text-to-speech</p>
          </header>

          <div className="upload-section">
            <div className="upload-area">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                id="pdf-upload"
                className="file-input"
              />
              <label htmlFor="pdf-upload" className="upload-label">
                <div className="upload-placeholder">
                  <IconUpload size={48} className="upload-icon" />
                  <span>Click to upload PDF</span>
                </div>
              </label>
            </div>

            {isLoading && (
              <div className="loading">
                <div className="spinner"></div>
                <p>Loading PDF...</p>
              </div>
            )}

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}
          </div>

          <footer className="footer">
            <p>
              Powered by <strong>Web Speech Technology</strong> — Beta Version
            </p>
            <p className="browser-note">
              Works best in Google Chrome
            </p>
          </footer>
        </div>
      </div>
    )
  }

  // Render PDF reader mode (when PDF is loaded)
  return (
    <div className="app app-reader">
      {/* Top Toolbar */}
      <div className={`reader-toolbar ${isMobile ? (toolbarVisible ? 'toolbar-visible' : 'toolbar-hidden') : ''}`}>
        <div className="toolbar-left">
          <div className="toolbar-logo">
            <img src="/logo.png" alt="SpeechCase" className="logo-small" />
            <span className="toolbar-title">SpeechCase</span>
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
              onClick={() => setInteractionMode('read')}
              className={`mode-btn ${interactionMode === 'read' ? 'active' : ''}`}
              title="Click words to set reading start position"
            >
              <IconSpeaker size={14} />
              <span>Set Start</span>
            </button>
            <button
              onClick={() => setInteractionMode('highlight')}
              className={`mode-btn ${interactionMode === 'highlight' ? 'active' : ''}`}
              title="Select text to create highlights"
            >
              <IconHighlighter size={14} />
              <span>Highlight</span>
            </button>
          </div>
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
            className={`pdf-sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isResizing ? 'resizing' : ''}`}
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
                {sidebarView === 'characters' && <CharactersSidebar />}
                {sidebarView === 'chat' && <ChatSidebar />}
                {sidebarView === 'highlights' && (
                  <HighlightsSidebar
                    highlightItems={highlightItems}
                    setHighlightItems={setHighlightItems}
                    documentId={documentId}
                    highlights={highlights}
                    onColorChange={handleChangeHighlightColor}
                    onDelete={handleDeleteHighlight}
                    pdfFileName={pdfFile?.name}
                    summaryText={summaryText}
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
            {!isSidebarCollapsed && (
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
            setHighlightItems={setHighlightItems}
            documentId={documentId}
            highlights={highlights}
            onColorChange={handleChangeHighlightColor}
            onDelete={handleDeleteHighlight}
            pdfFileName={pdfFile?.name}
            onMinimize={() => {
              setIsSummaryExpanded(false)
              setIsSidebarCollapsed(false)
            }}
            onSummaryGenerated={(text) => {
              setSummaryText(text)
            }}
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
            onSummaryGenerated={(text) => {
              setSummaryText(text)
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
                      maxWidth: '100%'
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
                      className="text-layer"
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

          {extractedText && interactionMode === 'read' && startPosition === 0 && (
            <div className="controls-panel-hint">
              Click any word in the PDF to set reading start position
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

export default App



