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
  IconMinimizeTimeline
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
  const hoveredHighlightIdRef = useRef(null) // Ref for hover state to avoid closure issues
  const isHoveringTooltipRef = useRef(false) // Track if mouse is over tooltip
  const [mousePosition, setMousePosition] = useState(null) // Track mouse position for temporary connection line: { x, y, page }
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
  const isProgrammaticScrollRef = useRef(false) // Track if scroll is programmatic (from our code) vs manual
  const lastProgrammaticScrollTimeRef = useRef(0) // Track when we last scrolled programmatically
  const pendingScrollTimeoutRef = useRef(null) // Track pending scroll timeout to cancel if needed
  const scrollPositionBeforeZoomRef = useRef(null) // Store scroll position before zoom to restore after re-render

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
      // Highlight mode was just deactivated, reverse expansion if still on highlights tab
      if (sidebarViewRef.current === 'highlights' && sidebarWidthRef.current >= 500) {
        setSidebarWidth(normalSidebarWidthRef.current || 230)
      }
      
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
  }, [pdfDoc, totalPages])

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

  // Re-render PDF pages when returning from expanded timeline view
  // Canvas content is lost when hidden, so we need to re-render when visible again
  useEffect(() => {
    if (!isTimelineExpanded && pdfDoc && totalPages > 0 && pageData.length > 0) {
      // Wait for DOM to be ready and PDF viewer to be visible
      const timeoutId = setTimeout(() => {
        renderPages()
      }, 200)
      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimelineExpanded])

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

  // Fine-tune scroll position after all pages are fully rendered
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

    // Debounce resize events
    let resizeTimeout
    const debouncedResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(handleResize, 150)
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
      if (originalNormalized) {
        normalizedLength = originalNormalized.length
      } else if (normalized.includes('|')) {
        normalizedLength = normalized.split('|')[0].length
      } else {
        normalizedLength = normalized.length
      }
      
      // Filter if:
      // 1. Text appears on multiple pages (likely header/footer), OR
      // 2. Text is very short (1-3 chars) and in header/footer region (likely page numbers, dates)
      // BUT: Only filter if it's actually in the header/footer region (already checked above)
      const isLikelyHeaderFooter = repetitionCount >= minRepetitions || 
                                 (normalizedLength <= 3 && isInHeaderFooterRegion)
      
      return !isLikelyHeaderFooter
    }).map(({ item }) => item)
    
    // Debug: Log if significant filtering occurred
    if (items.length - filtered.length > 0) {
      console.log(`[Filter] Page ${pageData.pageNum || 'unknown'}: Filtered ${items.length - filtered.length} of ${items.length} items`)
    }
    
    return filtered
  }

  // Async version with LLM classification (for background processing)
  const filterHeadersAndFootersWithLLM = async (pageData, textToPages, minRepetitions = 2) => {
    try {
      const { filterHeadersAndFooters } = await import('./services/pdfProcessing/footerFilter.js')
      return await filterHeadersAndFooters(pageData, textToPages, {
        minRepetitions,
        apiUrl: '/api/pdf/classify-footer',
        useLLMClassification: true
      })
    } catch (error) {
      console.warn('LLM footer classification failed, using sync version:', error)
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
          const updatePosition = () => {
            if (audio.currentTime && audio.duration && !isCancelledRef.current) {
              const progress = Math.min(1, Math.max(0, audio.currentTime / audio.duration))
              const textLength = text.length
              
              // Use direct position calculation based on audio progress
              // No offset - we want to track exactly where the audio is
              const estimatedPosition = Math.min(
                startPosition + (progress * textLength),
                startPosition + textLength - 1
              )
              
              // Clamp to valid range
              let clampedPosition = Math.max(0, Math.min(estimatedPosition, extractedText.length - 1))
              
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
          lastValidHighlightPositionRef.current = null
          
          highlightCurrentReading(startPosition)

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
          const updatePosition = () => {
            if (audio.currentTime && audio.duration && !isCancelledRef.current) {
              const progress = Math.min(1, Math.max(0, audio.currentTime / audio.duration))
              const chunkEndPosition = chunkIndex < allChunks.length - 1
                ? chunkStartPosition + chunkTextLength
                : Math.min(startPosition + text.length, extractedText.length)
              
              // Use direct position calculation based on audio progress
              // No offset - we want to track exactly where the audio is
              const positionInChunk = progress * chunkTextLength
              let estimatedPosition = Math.min(
                chunkStartPosition + positionInChunk,
                chunkEndPosition - 1
              )
              
              // Clamp to valid range in extracted text
              let clampedPosition = Math.max(0, Math.min(estimatedPosition, extractedText.length - 1))
              
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
              lastValidHighlightPositionRef.current = null
              
              highlightCurrentReading(startPosition)

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
        
        // Get the page data from our repetition map
        const pageData = pageTextItems.find(p => p.pageNum === pageNum)
        if (!pageData) continue
        
        // Filter out headers and footers using repetition detection (sync for immediate rendering)
        const filteredItems = filterHeadersAndFootersSync(pageData, textToPages)
        
        // Get original textContent for rendering (we'll use filtered items)
        const textContent = await page.getTextContent()
        const filteredTextContent = {
          ...textContent,
          items: filteredItems
        }
        
        // Build pageText consistently: trim items to avoid double spaces, join with single space
        const pageText = filteredItems.map(item => item.str.trim()).filter(str => str.length > 0).join(' ')

        pages.push({
          pageNum,
          viewport: {
            width: viewport.width,
            height: viewport.height
          },
          pageCharOffset,
          textContent: filteredTextContent
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
      
      // Background: Re-process pages with LLM classification (non-blocking)
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
            
            // Re-filter with LLM classification
            const filteredItems = await filterHeadersAndFootersWithLLM(pageData, textToPages)
            
            const textContent = await page.getTextContent()
            const filteredTextContent = {
              ...textContent,
              items: filteredItems
            }
            
            // Build pageText consistently: trim items to avoid double spaces, join with single space
            const pageText = filteredItems.map(item => item.str.trim()).filter(str => str.length > 0).join(' ')
            
            enhancedPages.push({
              pageNum,
              viewport: {
                width: viewport.width,
                height: viewport.height
              },
              pageCharOffset,
              textContent: filteredTextContent
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
    // CRITICAL: Use trimmed items to match extractedText construction
    // extractedText is built by trimming items and joining with ' ', so we must do the same here
    const pageTextItems = []
    let charIndex = 0
    let isFirstItem = true

    textContent.items.forEach((item) => {
      // Trim item to match extractedText construction (avoids double spaces)
      const trimmedStr = item.str.trim()
      // Skip empty items (they're filtered out in extractedText)
      if (trimmedStr.length === 0) {
        return
      }
      
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
      const angle = Math.atan2(tx[1], tx[0])
      const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3])
      const fontSize = (fontHeight * scaleY)
      const fontFamily = item.fontName
      const baseX = tx[4] * scaleX
      const baseY = (tx[5] - fontHeight) * scaleY
      
      // Account for space between items (extractedText joins trimmed items with ' ')
      // The first item doesn't have a preceding space, but subsequent items do
      if (!isFirstItem) {
        charIndex += 1 // Add space between items
      }
      isFirstItem = false
      
      // Split the trimmed text item into words and spaces
      // Group consecutive word characters together as words
      // Keep spaces and punctuation as separate segments for seamless highlighting
      const words = []
      let currentWord = ''
      for (let i = 0; i < trimmedStr.length; i++) {
        const char = trimmedStr[i]
        if (/\w/.test(char)) {
          // Word character - add to current word
          currentWord += char
        } else {
          // Non-word character (space, punctuation, etc.)
          // First, save any accumulated word
          if (currentWord.length > 0) {
            words.push(currentWord)
            currentWord = ''
          }
          // Add the non-word character as its own segment
          words.push(char)
        }
      }
      // Don't forget the last word if there's no trailing punctuation
      if (currentWord.length > 0) {
        words.push(currentWord)
      }
      
      let currentX = baseX
      let itemCharIndex = pageCharOffset + charIndex
      let textBeforeCurrentWord = ''
      
      words.forEach((word) => {
        const span = document.createElement('span')
        span.textContent = word
        span.style.position = 'absolute'
        // Calculate x position by measuring text width before this word
        const wordX = baseX + measureTextWidth(textBeforeCurrentWord, fontFamily, fontSize)
        
        span.style.left = wordX + 'px'
        span.style.top = baseY + 'px'
        span.style.fontSize = fontSize + 'px'
        span.style.fontFamily = fontFamily
        span.style.transform = `rotate(${angle}rad)`
        span.style.color = 'transparent'
        span.style.cursor = interactionMode === 'highlight' ? 'text' : 'pointer'
        span.style.userSelect = interactionMode === 'highlight' ? 'text' : 'none'
        span.style.whiteSpace = 'pre'
        // Ensure the span displays as inline-block so background covers full width
        span.style.display = 'inline-block'
        // Allow pointer events to pass through to highlights when not actively selecting
        // The highlight rectangles will capture hover events
        span.style.pointerEvents = interactionMode === 'highlight' ? 'auto' : 'auto'
        span.dataset.page = pageNum
        span.dataset.charIndex = itemCharIndex
        
        // Mark space-only spans to prevent double highlighting
        if (!/\S/.test(word)) {
          span.classList.add('text-space')
        }
        
        // Store text item with position info
        const textItem = {
          str: word,
          page: pageNum,
          charIndex: itemCharIndex,
          element: span
        }
        pageTextItems.push(textItem)
        
        // Add click handler - behavior depends on mode
        span.addEventListener('click', (e) => {
          if (interactionMode === 'read') {
            e.preventDefault()
            // For word-level spans, pass both the charIndex and the element
            // so we can mark it directly without searching
            if (/\S/.test(word)) {
              // It's a word - use its start position and element directly
              handleWordClick(textItem.charIndex, word, textItem.element)
            } else {
              // It's whitespace/punctuation - find the next word
              const nextWordStart = findWordStart(extractedText, textItem.charIndex + word.length)
              handleWordClick(nextWordStart, word)
            }
          }
          // In highlight mode, let default text selection work
        })

        textLayerDiv.appendChild(span)
        
        // Update position for next word
        textBeforeCurrentWord += word
        itemCharIndex += word.length
        currentX = wordX + measureTextWidth(word, fontFamily, fontSize)
      })
      
      // Use trimmed length to match extractedText construction
      charIndex += trimmedStr.length
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
        // Create haze overlay element
        const overlay = document.createElement('div')
        overlay.className = 'reading-haze-overlay active'
        
        // Calculate padding to make the haze extend beyond the word (reduced by another 20% for smaller height)
        const padding = Math.max(boundingBox.height * 0.512, 7)
        const hazeWidth = boundingBox.width + padding * 2
        const hazeHeight = boundingBox.height + padding * 2
        
        // Position the overlay relative to container
        overlay.style.position = 'absolute'
        overlay.style.left = (boundingBox.x - padding) + 'px'
        overlay.style.top = (boundingBox.y - padding) + 'px'
        overlay.style.width = hazeWidth + 'px'
        overlay.style.height = hazeHeight + 'px'
        
        // Add some organic variation to the shape for more natural look
        const variation = Math.random() * 15 - 7.5 // -7.5 to 7.5
        overlay.style.borderRadius = `${50 + variation}% ${40 + variation}% ${60 - variation}% ${30 - variation}% / ${60 + variation}% ${30 - variation}% ${70 + variation}% ${40 - variation}%`
        
        // Append to container
        boundingBox.container.appendChild(overlay)
        
        currentHazeOverlayRef.current = overlay
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
        const isNotFullyVisible = rect.bottom < 0 || 
                                 rect.top > viewportHeight || 
                                 rect.right < 0 || 
                                 rect.left > viewportWidth
        
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
    const validateElementText = (item) => {
      const relativePos = position - item.charIndex
      if (relativePos < 0 || relativePos >= item.str.length) {
        return false
      }
      
      // CRITICAL: Validate that the element's charIndex actually corresponds to the correct position in extractedText
      // Check if the text at item.charIndex in extractedText matches item.str
      if (item.charIndex >= 0 && item.charIndex + item.str.length <= extractedText.length) {
        const extractedTextAtItem = extractedText.substring(item.charIndex, item.charIndex + item.str.length)
        // Normalize for comparison (handle whitespace differences)
        const normalize = (str) => str.replace(/\s+/g, ' ').trim()
        if (normalize(extractedTextAtItem) !== normalize(item.str)) {
          // Text doesn't match at this charIndex - this item's charIndex is wrong
          return false
        }
      }
      
      // Check if the character at this position in the element matches extractedText
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
      
      // Background: Re-process with LLM classification (non-blocking)
      // This updates the text seamlessly without interrupting TTS
      // Only processes footer candidates in bottom 20% that weren't already filtered
      setTimeout(async () => {
        try {
          // Check if there are any footer candidates that need LLM classification
          let hasFooterCandidates = false
          const minRepetitions = 2
          for (const pageData of pageTextItems) {
            const { items, viewport } = pageData
            const footerThreshold = viewport.height * 0.80
            for (const { normalized, yPos } of items) {
              if (yPos >= footerThreshold) {
                const pagesWithThisText = textToPages.get(normalized)
                const repetitionCount = pagesWithThisText ? pagesWithThisText.size : 0
                // Candidate if in footer region, not already filtered, and not too short
                if (repetitionCount < minRepetitions && normalized.length > 3) {
                  hasFooterCandidates = true
                  break
                }
              }
            }
            if (hasFooterCandidates) break
          }
          
          if (!hasFooterCandidates) {
            return
          }
          let enhancedText = ''
          for (const pageData of pageTextItems) {
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
            const startCharIndex = lastHighlightedCharIndexRef.current !== null 
              ? lastHighlightedCharIndexRef.current 
              : position + segmentStartInText
          
          // ZERO LAG SOLUTION: Highlight the word that TTS is speaking RIGHT NOW
          // TTS boundary events fire when STARTING to speak a word, so we should highlight that word
          
          // Find all forward WORD items (ignore spaces/punctuation)
          const allForwardWordItems = textItems
            .filter(item => {
              if (!item.element || !item.element.isConnected || !item.str) return false
              if (item.charIndex <= startCharIndex) return false
              // Only consider word items (not spaces/punctuation)
              return /\S/.test(item.str) && normalizeWord(item.str).length > 0
            })
            .sort((a, b) => a.charIndex - b.charIndex)
          
          if (allForwardWordItems.length === 0) {
            return // No forward word items (end of text)
          }
          
          // Find the word that TTS is speaking RIGHT NOW
          // Strategy: Search for the spoken word within a reasonable window (5 words)
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
          
          // ELEGANT SOLUTION: The TTS handler has already found the correct word item
          // (including items on the next page). Instead of re-validating through
          // highlightCurrentReading, directly highlight the element that TTS identified.
          // This trusts the word-matching logic and avoids all the validation layers
          // that were blocking legitimate page transitions.
          
          const reliablePosition = targetItem.charIndex
          const elementPage = getElementPageNumber(targetItem.element)
          const isPageTransition = currentReadingPageRef.current !== null && 
                                  elementPage !== null && 
                                  elementPage !== currentReadingPageRef.current
          
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
            
            // Highlight the starting position
            highlightCurrentReading(position)
            
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

    // Only clear the saved position if we successfully scrolled
    // This allows the fine-tuning effect to run if needed
    if (Math.abs(pdfViewer.scrollTop - targetScrollTop) < 10) {
      scrollPositionBeforeZoomRef.current = null
    }
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
        selectedSpans.push({
          span,
          textNode,
          startOffset,
          endOffset,
          spanLeft: parseFloat(span.style.left) || 0,
          spanTop: parseFloat(span.style.top) || 0,
          fontSize: parseFloat(span.style.fontSize) || 12,
          fontFamily: span.style.fontFamily || 'sans-serif',
          transform: span.style.transform
        })
      }
    })
    
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
    
    // Sort selected spans by their position (top, then left)
    selectedSpans.sort((a, b) => {
      const topDiff = a.spanTop - b.spanTop
      if (Math.abs(topDiff) > 1) { // Allow small tolerance for same line
        return topDiff
      }
      return a.spanLeft - b.spanLeft
    })
    
    // Group consecutive spans on the same line and combine them
    let currentGroup = []
    let currentTop = null
    const tolerance = 1 // Tolerance for considering spans on the same line
    
    selectedSpans.forEach((spanInfo, index) => {
      const isNewLine = currentTop === null || Math.abs(spanInfo.spanTop - currentTop) > tolerance
      
      if (isNewLine) {
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
      } else {
        // Add to current group
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
        const div = document.createElement('div')
        div.className = 'selection-rect'
        div.style.position = 'absolute'
        div.style.left = rect.x + 'px'
        div.style.top = rect.y + 'px'
        div.style.width = rect.width + 'px'
        div.style.height = rect.height + 'px'
        div.style.backgroundColor = highlightBgColor
        div.style.pointerEvents = 'none'
        div.style.zIndex = '3'
        div.style.borderRadius = '2px'
        
        selectionLayer.appendChild(div)
      })
    }

    const getRangeFromPoint = (x, y) => {
      if (document.caretRangeFromPoint) {
        return document.caretRangeFromPoint(x, y)
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y)
        if (!pos) return null
        const range = document.createRange()
        range.setStart(pos.offsetNode, pos.offset)
        range.setEnd(pos.offsetNode, pos.offset)
        return range
      } else {
        // Fallback: use elementFromPoint and find text node
        const element = document.elementFromPoint(x, y)
        if (!element) return null
        
        // Find the text layer span
        const span = element.closest('.text-layer span')
        if (!span || !span.firstChild) return null
        
        const textNode = span.firstChild
        if (textNode.nodeType !== Node.TEXT_NODE) return null
        
        // Create range at start of text node
        const range = document.createRange()
        range.setStart(textNode, 0)
        range.setEnd(textNode, 0)
        return range
      }
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

      // Prevent default selection
      e.preventDefault()
      
      // Get the text node and offset at click position
      const range = getRangeFromPoint(e.clientX, e.clientY)
      if (!range) return

      // Store start of selection
      selectionStartRangeRef.current = range.cloneRange()
      isDraggingSelectionRef.current = true

      // Clear any existing selection
      window.getSelection().removeAllRanges()
    }

    const handleMouseMove = (e) => {
      if (!isDraggingSelectionRef.current || !selectionStartRangeRef.current) return

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

      // Get current position
      const range = getRangeFromPoint(e.clientX, e.clientY)
      if (!range) return

      // Create selection range from start to current position
      const selectionRange = selectionStartRangeRef.current.cloneRange()
      selectionRange.setEnd(range.endContainer, range.endOffset)

      // Render custom overlay
      renderSelectionOverlay(selectionRange, pageNum)
    }

    const handleMouseUp = (e) => {
      if (!isDraggingSelectionRef.current || !selectionStartRangeRef.current) {
        isDraggingSelectionRef.current = false
        return
      }

      // Find which page we're on
      let pageNum = null
      for (const [page, textLayer] of Object.entries(textLayerRefs.current)) {
        if (textLayer && (textLayer.contains(e.target) || textLayer === e.target)) {
          pageNum = parseInt(page)
          break
        }
      }

      if (!pageNum) {
        // Clear selection overlay
        Object.values(selectionLayerRefs.current).forEach(layer => {
          if (layer) layer.innerHTML = ''
        })
        isDraggingSelectionRef.current = false
        selectionStartRangeRef.current = null
        return
      }

      // Get final position
      const range = getRangeFromPoint(e.clientX, e.clientY)
      if (!range) {
        isDraggingSelectionRef.current = false
        selectionStartRangeRef.current = null
        return
      }

      // Create final selection range
      const selectionRange = selectionStartRangeRef.current.cloneRange()
      selectionRange.setEnd(range.endContainer, range.endOffset)

      const selectedText = selectionRange.toString().trim()
      
      if (selectedText.length === 0) {
        // Clear selection overlay
        Object.values(selectionLayerRefs.current).forEach(layer => {
          if (layer) layer.innerHTML = ''
        })
        isDraggingSelectionRef.current = false
        return
      }

      const textLayerDiv = textLayerRefs.current[pageNum]
      if (!textLayerDiv) {
        isDraggingSelectionRef.current = false
        return
      }

      // Calculate precise rectangles
      const rectangles = calculatePreciseRectangles(selectionRange, textLayerDiv)
      
      if (rectangles && rectangles.length > 0) {
        // Get page info to store scale
        const pageInfo = pageData.find(p => p.pageNum === pageNum)
        const scale = pageInfo ? pageScale : 1.5
        
        // Create highlight with array of rectangles
        const highlight = {
          id: Date.now() + Math.random(),
          page: pageNum,
          rects: rectangles,
          text: selectedText,
          color: highlightColor,
          scale
        }
        
        // Add to history for undo/redo
        setHighlights(prev => {
          const newHighlights = [...prev, highlight]
          setHighlightHistory(hist => {
            const currentIdx = historyIndexRef.current
            const newHistory = hist.slice(0, currentIdx + 1)
            newHistory.push(newHighlights)
            const newIdx = newHistory.length - 1
            historyIndexRef.current = newIdx
            setHistoryIndex(newIdx)
            return newHistory
          })
          return newHighlights
        })
        
        // Add to highlight items for sidebar
        setHighlightItems(prev => {
          const newItem = {
            id: highlight.id,
            text: selectedText.trim(),
            color: highlightColor,
            order: prev.length
          }
          return [...prev, newItem]
        })
      }

      // Clear selection overlay
      Object.values(selectionLayerRefs.current).forEach(layer => {
        if (layer) layer.innerHTML = ''
      })

      isDraggingSelectionRef.current = false
      selectionStartRangeRef.current = null
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
    // Clear all highlight layers first
    Object.values(highlightLayerRefs.current).forEach(layer => {
      if (layer) {
        layer.innerHTML = ''
      }
    })

    // Re-render all highlights
    highlights.forEach(highlight => {
      const highlightLayer = highlightLayerRefs.current[highlight.page]
      if (highlightLayer) {
        renderHighlight(highlight, highlightLayer)
      }
    })
  }, [highlights, pageData, renderedPages, pageScale, hoveredHighlightId, connectingFrom])

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

      if (pageNum !== null) {
        const canvas = canvasRefs.current[pageNum]
        if (canvas) {
          const rect = canvas.getBoundingClientRect()
          const x = e.clientX - rect.left
          const y = e.clientY - rect.top
          setMousePosition({ x, y, page: pageNum })
        } else {
          setMousePosition(null)
        }
      } else {
        // Mouse is not over any canvas, clear position
        setMousePosition(null)
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

    // Render temporary connection line if connecting (follows mouse)
    // Only show if mouse is over a canvas/page
    if (connectingFrom && mousePosition && mousePosition.page) {
      const fromHighlight = highlights.find(h => h.id === connectingFrom.highlightId)
      if (fromHighlight && fromHighlight.page === mousePosition.page) {
        const connectionLayer = connectionLayerRefs.current[fromHighlight.page]
        const canvas = canvasRefs.current[fromHighlight.page]
        if (connectionLayer && canvas) {
          const canvasRect = canvas.getBoundingClientRect()
          const canvasWidth = canvas.width
          const canvasHeight = canvas.height
          const displayedWidth = canvasRect.width
          const displayedHeight = canvasRect.height
          
          const displayScaleX = displayedWidth / canvasWidth
          const displayScaleY = displayedHeight / canvasHeight
          const scaleRatio = (pageScale / (fromHighlight.scale || pageScale)) * displayScaleX
          const scaleRatioY = (pageScale / (fromHighlight.scale || pageScale)) * displayScaleY

          const highlightRects = fromHighlight.rects || [{
            x: fromHighlight.x || 0,
            y: fromHighlight.y || 0,
            width: fromHighlight.width || 0,
            height: fromHighlight.height || 0
          }]

          const fromRect = connectingFrom.dot === 'left' ? highlightRects[0] : highlightRects[highlightRects.length - 1]
          const fromX = connectingFrom.dot === 'left' 
            ? fromRect.x * scaleRatio
            : (fromRect.x + fromRect.width) * scaleRatio
          const fromY = (fromRect.y + fromRect.height / 2) * scaleRatioY

          // Use mouse position for the "to" point
          const toX = mousePosition.x
          const toY = mousePosition.y

          // Create SVG for temporary line
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
          svg.style.position = 'absolute'
          svg.style.left = '0'
          svg.style.top = '0'
          svg.setAttribute('width', displayedWidth)
          svg.setAttribute('height', displayedHeight)
          svg.style.pointerEvents = 'none'
          svg.style.zIndex = '1'

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          const midX = (fromX + toX) / 2
          const pathData = `M ${fromX} ${fromY} Q ${midX} ${fromY} ${midX} ${(fromY + toY) / 2} T ${toX} ${toY}`
          path.setAttribute('d', pathData)
          path.setAttribute('stroke', getDotColor(fromHighlight.color || 'yellow'))
          path.setAttribute('stroke-width', '2')
          path.setAttribute('fill', 'none')
          path.setAttribute('stroke-dasharray', '5,5')
          path.style.opacity = '0.6'

          svg.appendChild(path)
          connectionLayer.appendChild(svg)
        }
      }
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
          // Sort by page, then by position
          if (a.page !== b.page) return a.page - b.page
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
      if (aHighlight.page !== bHighlight.page) return aHighlight.page - bHighlight.page
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
      // Update existing items with new text/color, add new ones
      const updated = mergedItems.map(mergedItem => {
        const existing = prev.find(item => item.id === mergedItem.id)
        if (existing) {
          return { ...existing, ...mergedItem }
        }
        return mergedItem
      })
      
      // Remove items that no longer exist
      const highlightIds = new Set(highlights.map(h => h.id))
      return updated.filter(item => {
        if (item.isMerged && item.mergedIds) {
          return item.mergedIds.some(id => highlightIds.has(id))
        }
        return highlightIds.has(item.id)
      })
    })
  }, [highlights, mergeConnectedHighlights])

  // Update all existing highlight opacities to ensure they use the latest value
  useEffect(() => {
    Object.values(highlightLayerRefs.current).forEach(layer => {
      if (layer) {
        const highlightRects = layer.querySelectorAll('.highlight-rect')
        highlightRects.forEach(rect => {
          rect.style.backgroundColor = 'rgba(251, 188, 4, 0.24)'
        })
      }
    })
  }, [renderedPages])

  // Undo/redo functions for highlights
  const handleUndoHighlight = useCallback(() => {
    setHighlightHistory(hist => {
      // Always read from ref to get the most current value
      const currentIdx = historyIndexRef.current
      if (currentIdx > 0) {
        const newIndex = currentIdx - 1
        historyIndexRef.current = newIndex
        setHistoryIndex(newIndex)
        const newHighlights = hist[newIndex] || []
        setHighlights([...newHighlights])
      }
      return hist
    })
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

  // Update ref when history index changes
  useEffect(() => {
    historyIndexRef.current = historyIndex
  }, [historyIndex])

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

  // Helper function to get highlight color
  const getHighlightColor = (color) => {
    const colors = {
      yellow: 'rgba(251, 188, 4, 0.24)',
      green: 'rgba(52, 168, 83, 0.24)',
      blue: 'rgba(66, 133, 244, 0.24)'
    }
    return colors[color] || colors.yellow
  }

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
    const highlightBgColor = getHighlightColor(highlight.color || 'yellow')
    const borderColor = getHighlightBorderColor(highlight.color || 'yellow')
    const dotColor = getDotColor(highlight.color || 'yellow')
    
    // Remove existing highlights and dots for this highlight to re-render fresh
    const existingHighlights = highlightLayer.querySelectorAll(`[data-highlight-id="${highlight.id}"]`)
    existingHighlights.forEach(el => el.remove())
    const existingDots = highlightLayer.querySelectorAll(`[data-highlight-id="${highlight.id}"][data-dot]`)
    existingDots.forEach(el => el.remove())

    // Get current page info to adjust coordinates if scale changed
    const pageInfo = pageData.find(p => p.pageNum === highlight.page)
    if (!pageInfo) return

    // Get canvas to calculate display scaling
    const canvas = canvasRefs.current[highlight.page]
    if (!canvas) return

    const canvasRect = canvas.getBoundingClientRect()
    const canvasWidth = canvas.width
    const canvasHeight = canvas.height
    const displayedWidth = canvasRect.width
    const displayedHeight = canvasRect.height
    
    // Calculate scale factors for canvas display
    const displayScaleX = displayedWidth / canvasWidth
    const displayScaleY = displayedHeight / canvasHeight

    // Adjust coordinates if scale has changed since highlight was created
    // Also account for canvas display scaling
    const scaleRatio = (pageScale / (highlight.scale || pageScale)) * displayScaleX
    const scaleRatioY = (pageScale / (highlight.scale || pageScale)) * displayScaleY
    
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
      const height = rect.height * scaleRatioY * 1.15 // Increase height by 15% downward

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
      div.style.pointerEvents = 'auto' // Enable pointer events for hover
      div.style.zIndex = '10' // Higher z-index to be above text spans
      div.style.cursor = 'default'
      div.style.transition = 'border-color 0.2s ease'
      
      // Add hover effect
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
            const tooltipY = rect.top - canvasRect.top - 7.5 // Position above the highlight (25% closer)
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
      
      highlightLayer.appendChild(div)
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
      leftDot.style.pointerEvents = 'auto'
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
      rightDot.style.pointerEvents = 'auto'
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
          const viewport = pdfjsPage.getViewport({ scale: 2.0 }) // Higher scale for better quality
          
          // Get page dimensions from PDF.js viewport (convert from points to PDF units)
          // PDF.js viewport dimensions are in points (1/72 inch), which is the same as PDF units
          const width = viewport.width
          const height = viewport.height
          
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
      highlights.forEach(highlight => {
        if (highlight.page <= pages.length) {
          const page = pages[highlight.page - 1] // pdf-lib uses 0-indexed
          const { width: pageWidth, height: pageHeight } = page.getSize()
          
          // Get the viewport scale from pageData to convert coordinates
          const pageInfo = pageData.find(p => p.pageNum === highlight.page)
          if (pageInfo) {
            // Convert coordinates from viewport (at creation scale) to PDF coordinates
            const creationScale = highlight.scale || pageScale
            const viewportWidth = pageInfo.viewport.width
            const viewportHeight = pageInfo.viewport.height
            
            // Scale factors to convert from viewport to PDF
            const scaleX = pageWidth / viewportWidth
            const scaleY = pageHeight / viewportHeight
            
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
            let pdfOpacity = 0.3 // Default opacity for highlights
            
            switch (highlightColor) {
              case 'yellow':
                pdfColor = rgb(0.984, 0.737, 0.016) // rgba(251, 188, 4) normalized
                pdfOpacity = 0.3
                break
              case 'green':
                pdfColor = rgb(0.204, 0.659, 0.325) // rgba(52, 168, 83) normalized
                pdfOpacity = 0.3
                break
              case 'blue':
                pdfColor = rgb(0.259, 0.522, 0.957) // rgba(66, 133, 244) normalized
                pdfOpacity = 0.3
                break
              default:
                pdfColor = rgb(0.984, 0.737, 0.016) // Default to yellow
                pdfOpacity = 0.3
            }
            
            // Draw each rectangle separately
            rects.forEach(rect => {
              // Convert highlight coordinates to PDF coordinates
              // PDF coordinates start from bottom-left, but our coordinates start from top-left
              const pdfX = rect.x * scaleX
              const pdfY = pageHeight - (rect.y * scaleY) - (rect.height * scaleY)
              const pdfWidth = rect.width * scaleX
              const pdfHeight = rect.height * scaleY
              
              // Only draw if coordinates are valid and within page bounds
              if (pdfWidth > 0 && pdfHeight > 0 && pdfX >= 0 && pdfY >= 0 && 
                  pdfX + pdfWidth <= pageWidth && pdfY + pdfHeight <= pageHeight) {
                // Add highlight annotation with proper color and opacity
                page.drawRectangle({
                  x: pdfX,
                  y: pdfY,
                  width: pdfWidth,
                  height: pdfHeight,
                  color: pdfColor,
                  opacity: pdfOpacity,
                  borderOpacity: 0
                })
              }
            })
          }
        }
      })

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
              <IconCursor size={14} />
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
            onClick={handleReset}
            className="btn-toolbar"
            title="Close document"
          >
            <IconClose size={16} />
          </button>
        </div>
      </div>

      {/* Highlight Control Panel */}
      {interactionMode === 'highlight' && pdfDoc && !isMobile && (
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
                    setIsTimelineExpanded={setIsTimelineExpanded}
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
                    onExpandSummary={() => {
                      setIsSummaryExpanded(true)
                      setIsSidebarCollapsed(true)
                    }}
                    onExpandHighlights={() => {
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
            pdfFileName={pdfFile?.name}
            onMinimize={() => {
              setIsSummaryExpanded(false)
              setIsSidebarCollapsed(false)
            }}
          />
        ) : isHighlightsExpanded && highlightItems.length > 0 ? (
          <HighlightsFullView
            highlightItems={highlightItems}
            pdfFileName={pdfFile?.name}
            onMinimize={() => {
              setIsHighlightsExpanded(false)
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
              <button
                className="btn-back-to-pdf"
                onClick={() => setIsTimelineExpanded(false)}
                title="Back to PDF"
              >
                <IconChevronLeft size={18} />
                <span>Back to PDF</span>
              </button>
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
                    />
                    <div
                      ref={(el) => {
                        if (el) highlightLayerRefs.current[pageInfo.pageNum] = el
                      }}
                      className="highlight-layer"
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


