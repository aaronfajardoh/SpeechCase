import { useState, useRef, useEffect, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { PDFDocument, rgb } from 'pdf-lib'
import './App.css'

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

// Apple-like SVG Icons
const IconUpload = ({ size = 24, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
)

const IconDocument = ({ size = 24, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
)

const IconPlay = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M8 5v14l11-7z" />
  </svg>
)

const IconPause = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
)

const IconStop = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6" y="6" width="12" height="12" />
  </svg>
)

const IconReset = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)

const IconRewind = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="11 19 2 12 11 5 11 19" />
    <polygon points="22 19 13 12 22 5 22 19" />
  </svg>
)

const IconForward = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="13 19 22 12 13 5 13 19" />
    <polygon points="2 19 11 12 2 5 2 19" />
  </svg>
)

const IconDownload = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

const IconClose = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const IconMinimize = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const IconSpeaker = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
)

const IconLoading = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={{ animation: 'spin 1s linear infinite' }}>
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" strokeDasharray="31.416" strokeDashoffset="23.562" />
  </svg>
)

const IconHighlighter = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
)

const IconCursor = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
  </svg>
)

const IconZoomIn = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
)

const IconZoomOut = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
)

const IconUndo = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </svg>
)

const IconRedo = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 7v6h-6" />
    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
  </svg>
)

const IconTarget = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
)

const IconNavigation = ({ size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    {/* Upward-pointing triangle (arrow) */}
    <path d="M12 3L8 10h8L12 3z" />
    {/* Small detached base */}
    <rect x="10.5" y="11" width="3" height="1.5" rx="0.5" />
  </svg>
)

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
  const [highlights, setHighlights] = useState([]) // Store highlight data: { page, x, y, width, height, text }
  const [highlightHistory, setHighlightHistory] = useState([[]]) // History stack for undo/redo
  const [historyIndex, setHistoryIndex] = useState(0) // Current position in history
  const [interactionMode, setInteractionMode] = useState('read') // 'read' or 'highlight'
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState(null)
  const [currentSelection, setCurrentSelection] = useState(null)
  const canvasRefs = useRef({}) // Store canvas refs by page number
  const textLayerRefs = useRef({}) // Store text layer refs by page number
  const highlightLayerRefs = useRef({}) // Store highlight layer refs by page number
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

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

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

      // TEMPORARILY: Use browser TTS for both languages (Google TTS disabled for debugging)
      // Use Google TTS for Spanish, browser TTS for English
      console.log('Media Session: Starting playback, language:', langToUse, 'text length:', textToRead.length)
      if (false && langToUse === 'es') {
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

        const utterance = new SpeechSynthesisUtterance(textToRead)
        utterance.lang = 'en-US'
        utterance.rate = playbackSpeedRef.current
        utterance.pitch = 1.0
        utterance.volume = 1.0

        utterance.onboundary = (event) => {
          if (event.name === 'word' || event.name === 'sentence') {
            const absolutePosition = position + event.charIndex
            currentPlaybackPositionRef.current = absolutePosition
            lastBoundaryPositionRef.current = absolutePosition
          }
        }

        utterance.onstart = () => {
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
        
        utterance.onend = () => {
          setIsPlaying(false)
          currentPlaybackPositionRef.current = currentText.length
          playbackStartTimeRef.current = null
          
          if ('mediaSession' in navigator) {
            // Keep as 'paused' instead of 'none' so macOS continues to route media keys
            navigator.mediaSession.playbackState = 'paused'
          }
        }
        
        utterance.onerror = (event) => {
          // Ignore "interrupted" errors - these are expected when pausing/cancelling speech
          if (event.error === 'interrupted') {
            setIsPlaying(false)
            playbackStartTimeRef.current = null
            
            if ('mediaSession' in navigator) {
              // Keep as 'paused' instead of 'none' so macOS continues to route media keys
              navigator.mediaSession.playbackState = 'paused'
            }
            return
          }
          
          // Only show errors for actual problems
          setError('Error during speech: ' + event.error)
          setIsPlaying(false)
          playbackStartTimeRef.current = null
          
          if ('mediaSession' in navigator) {
            // Keep as 'paused' instead of 'none' so macOS continues to route media keys
            navigator.mediaSession.playbackState = 'paused'
          }
        }

        utteranceRef.current = utterance
        synthRef.current.speak(utterance)
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
  const normalizeText = (text) => {
    return text.trim().toLowerCase().replace(/\s+/g, ' ')
  }

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
      textContent.items.forEach((item) => {
        const normalized = normalizeText(item.str)
        if (normalized.length > 0) {
          if (!textToPages.has(normalized)) {
            textToPages.set(normalized, new Set())
          }
          textToPages.get(normalized).add(pageNum)
          
          // Store item with position info
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
          const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3])
          const yPos = tx[5] - fontHeight
          
          pageItems.push({
            item,
            normalized,
            yPos
          })
        }
      })
      pageTextItems.push({ pageNum, items: pageItems, viewport })
    }
    
    return { textToPages, pageTextItems }
  }

  // Filter headers and footers using repetition detection
  const filterHeadersAndFooters = (pageData, textToPages, minRepetitions = 2) => {
    const { items, viewport } = pageData
    const headerThreshold = viewport.height * 0.15 // Top 15% of page
    const footerThreshold = viewport.height * 0.85 // Bottom 15% of page
    
    return items.filter(({ item, normalized, yPos }) => {
      const isInHeader = yPos <= headerThreshold
      const isInFooter = yPos >= footerThreshold
      const isInHeaderFooterRegion = isInHeader || isInFooter
      
      if (!isInHeaderFooterRegion) {
        // Not in header/footer region, keep it
        return true
      }
      
      // In header/footer region - check if it repeats across pages
      const pagesWithThisText = textToPages.get(normalized)
      const repetitionCount = pagesWithThisText ? pagesWithThisText.size : 0
      
      // Filter if:
      // 1. Text appears on multiple pages (likely header/footer), OR
      // 2. Text is very short (1-3 chars) and in header/footer region (likely page numbers, dates)
      const isLikelyHeaderFooter = repetitionCount >= minRepetitions || 
                                   (normalized.length <= 3 && isInHeaderFooterRegion)
      
      return !isLikelyHeaderFooter
    }).map(({ item }) => item) // Return just the original items
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

  // Function to call Google TTS API for Spanish text
  const synthesizeGoogleTTS = async (text, rate = 1.0) => {
    try {
      console.log('Calling Google TTS API with text length:', text.length, 'rate:', rate)
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, rate }),
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
        const response = await synthesizeGoogleTTS(text, rate)
        setIsTTSLoading(false)
        const { audioContent, mimeType } = response

        const audio = new Audio(`data:${mimeType};base64,${audioContent}`)
        audio.playbackRate = rate
        audioRef.current = audio

        // Track position
        const updatePosition = () => {
          if (audio.currentTime && audio.duration && !isCancelledRef.current) {
            const progress = audio.currentTime / audio.duration
            const textLength = text.length
            const estimatedPosition = startPosition + Math.floor(progress * textLength)
            currentPlaybackPositionRef.current = estimatedPosition
            lastBoundaryPositionRef.current = estimatedPosition

            const wordStart = findWordStart(extractedText, estimatedPosition)
            highlightCurrentReading(wordStart)
          }
        }

        audio.addEventListener('timeupdate', updatePosition)

        audio.addEventListener('play', () => {
          currentPlaybackPositionRef.current = startPosition
          playbackStartPositionRef.current = startPosition
          playbackStartTimeRef.current = Date.now()
          lastBoundaryPositionRef.current = startPosition
          previousBoundaryPositionRef.current = startPosition
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
            const response = await synthesizeGoogleTTS(allChunks[chunkIndex], rate)
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
          
          // Double-check that audioRef is still null (might have been set by another playback)
          if (audioRef.current) {
            console.log('Audio ref already set, cancelling this chunk')
            audio.pause()
            audio.src = ''
            return Promise.resolve()
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

          // Track position
          const updatePosition = () => {
            if (audio.currentTime && audio.duration && !isCancelledRef.current) {
              const progress = audio.currentTime / audio.duration
              const chunkEndPosition = chunkIndex < allChunks.length - 1
                ? chunkStartPosition + chunkTextLength
                : startPosition + text.length
              const estimatedPosition = Math.min(
                chunkStartPosition + Math.floor(progress * chunkTextLength),
                chunkEndPosition
              )
              currentPlaybackPositionRef.current = estimatedPosition
              lastBoundaryPositionRef.current = estimatedPosition

              const wordStart = findWordStart(extractedText, estimatedPosition)
              highlightCurrentReading(wordStart)
            }
          }

          audio.addEventListener('timeupdate', updatePosition)

          if (chunkIndex === 0) {
            audio.addEventListener('play', () => {
              currentPlaybackPositionRef.current = startPosition
              playbackStartPositionRef.current = startPosition
              playbackStartTimeRef.current = Date.now()
              lastBoundaryPositionRef.current = startPosition
              previousBoundaryPositionRef.current = startPosition
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
              
              // Check if this audio is still the current one (might have been replaced)
              if (audioRef.current !== audio) {
                console.log('Audio was replaced, not playing next chunk')
                resolve()
                return
              }
              
              currentChunkIndexRef.current = chunkIndex + 1
              
              // Play next chunk if available and not cancelled
              if (!isCancelledRef.current && chunkIndex + 1 < allChunks.length && audioRef.current === audio) {
                console.log(`Playing next chunk ${chunkIndex + 2} of ${allChunks.length}`)
                
                // Check if next chunk is already preloaded
                if (chunkCache.has(chunkIndex + 1)) {
                  // Next chunk is ready - play immediately (no pause!)
                  console.log(`Next chunk is preloaded, playing immediately`)
                  playChunk(chunkIndex + 1)
                    .then(resolve)
                    .catch((err) => {
                      console.error('Error playing next chunk:', err)
                      setIsPlaying(false)
                      isPlayingRef.current = false
                      setError('Error playing next audio chunk: ' + err.message)
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
                          .then(resolve)
                          .catch((err) => {
                            console.error('Error playing next chunk:', err)
                            setIsPlaying(false)
                            isPlayingRef.current = false
                            setError('Error playing next audio chunk: ' + err.message)
                            resolve()
                          })
                      } else {
                        resolve()
                      }
                    })
                    .catch((err) => {
                      setIsTTSLoading(false)
                      console.error('Error preloading next chunk:', err)
                      setIsPlaying(false)
                      isPlayingRef.current = false
                      setError('Error loading next audio chunk: ' + err.message)
                      resolve()
                    })
                }
              } else {
                // All chunks done or cancelled
                console.log('All chunks finished or cancelled')
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
              console.error('Audio playback error:', event, audio.error)
              if (!isCancelledRef.current) {
                const errorMsg = audio.error ? `Code: ${audio.error.code}, Message: ${audio.error.message}` : 'Unknown error'
                setError('Error playing audio: ' + errorMsg)
                setIsPlaying(false)
                isPlayingRef.current = false
                playbackStartTimeRef.current = null
                clearReadingHighlight()

                if ('mediaSession' in navigator) {
                  navigator.mediaSession.playbackState = 'paused'
                }
              }
              audioRef.current = null
              reject(new Error(errorMsg || 'Audio playback error'))
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
        
        // Filter out headers and footers using repetition detection
        const filteredItems = filterHeadersAndFooters(pageData, textToPages)
        
        // Get original textContent for rendering (we'll use filtered items)
        const textContent = await page.getTextContent()
        const filteredTextContent = {
          ...textContent,
          items: filteredItems
        }
        
        const pageText = filteredItems.map(item => item.str).join(' ')

        pages.push({
          pageNum,
          viewport: {
            width: viewport.width,
            height: viewport.height
          },
          pageCharOffset,
          textContent: filteredTextContent
        })

        pageCharOffset += pageText.length + 2 // +2 for page break
      }

      setPageData(pages)
    } catch (err) {
      console.error('Error initializing pages:', err)
      setError('Error loading PDF pages: ' + err.message)
    }
  }

  const renderPages = async () => {
    if (!pdfDoc || pageData.length === 0) return

    try {
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

        // Render text layer (this will also set text layer dimensions)
        await renderTextLayerForPage(textContent, viewportObj, pageNum, textLayerDiv, pageCharOffset)

        setRenderedPages(prev => {
          if (!prev.includes(pageNum)) {
            return [...prev, pageNum]
          }
          return prev
        })
      }
    } catch (err) {
      console.error('Error rendering pages:', err)
      setError('Error rendering PDF pages: ' + err.message)
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
    const pageTextItems = []
    let charIndex = 0

    textContent.items.forEach((item) => {
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
      const angle = Math.atan2(tx[1], tx[0])
      const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3])
      
      const span = document.createElement('span')
      span.textContent = item.str
      span.style.position = 'absolute'
      // Scale positions to match canvas display size
      span.style.left = (tx[4] * scaleX) + 'px'
      span.style.top = ((tx[5] - fontHeight) * scaleY) + 'px'
      span.style.fontSize = (fontHeight * scaleY) + 'px'
      span.style.fontFamily = item.fontName
      span.style.transform = `rotate(${angle}rad)`
      span.style.color = 'transparent'
      span.style.cursor = interactionMode === 'highlight' ? 'text' : 'pointer'
      span.style.userSelect = interactionMode === 'highlight' ? 'text' : 'none'
      span.style.whiteSpace = 'pre'
      span.dataset.page = pageNum
      span.dataset.charIndex = pageCharOffset + charIndex
      
      // Store text item with position info
      const textItem = {
        str: item.str,
        page: pageNum,
        charIndex: pageCharOffset + charIndex,
        element: span
      }
      pageTextItems.push(textItem)
      
      // Add click handler - behavior depends on mode
      span.addEventListener('click', (e) => {
        if (interactionMode === 'read') {
          e.preventDefault()
          handleWordClick(textItem.charIndex, item.str)
        }
        // In highlight mode, let default text selection work
      })

      textLayerDiv.appendChild(span)
      charIndex += item.str.length
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

  // Clear the current reading position highlight
  const clearReadingHighlight = () => {
    if (currentReadingElementRef.current) {
      const element = currentReadingElementRef.current
      // Check if element is still in DOM before trying to modify it
      if (element.isConnected) {
        // Only remove reading highlight, preserve start position marker if it's the same element
        if (element.classList.contains('start-position-marker')) {
          // If it's also the start marker, just remove reading-specific styles (green glow)
          // Keep the blue background and border
          element.style.removeProperty('box-shadow')
          element.classList.remove('current-reading-marker')
        } else {
          // If it's NOT the start marker, remove all reading highlight styles
          // This won't affect the blue start marker which is on a different element
          element.style.removeProperty('background-color')
          element.style.removeProperty('border-bottom')
          element.style.removeProperty('border-bottom-color')
          element.style.removeProperty('box-shadow')
          element.classList.remove('current-reading-marker')
        }
      }
      currentReadingElementRef.current = null
    }
    // Only clear the reading position state if playback is not active
    // This ensures the button stays visible when user scrolls away during playback
    if (!isPlayingRef.current) {
      setHasCurrentReadingPosition(false)
    }
    // Don't reset previousBoundaryPositionRef here - it's used for tracking
  }

  // Helper function to apply reading highlight
  const applyReadingHighlight = (element) => {
    // Clear previous reading highlight (but preserve blue start marker if it's on a different element)
    clearReadingHighlight()
    
    // Apply reading highlight (green) - this should coexist with blue start marker
    if (element.classList.contains('start-position-marker')) {
      // If this element is ALSO the start marker, add green glow on top of blue
      // The blue background and border are already there, just add green glow
      element.style.setProperty('box-shadow', '0 0 8px rgba(34, 197, 94, 0.8), 0 0 12px rgba(34, 197, 94, 0.6)', 'important')
    } else {
      // If this is a different element, apply full green highlight
      // This won't affect the blue start marker which is on a different element
      element.style.setProperty('background-color', 'rgba(34, 197, 94, 0.4)', 'important')
      element.style.setProperty('border-bottom', '2px solid #22c55e', 'important')
      element.style.setProperty('border-bottom-color', '#22c55e', 'important')
      element.style.setProperty('box-shadow', '0 0 8px rgba(34, 197, 94, 0.5)', 'important')
    }
    element.classList.add('current-reading-marker')
    currentReadingElementRef.current = element
    setHasCurrentReadingPosition(true)
    
    // Scroll the element into view if auto-scroll is enabled and it's not visible
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
      
      // Use a small delay to ensure styles are applied
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
        
        // Only scroll if element is significantly out of view (more than 50px)
        // This prevents unnecessary scrolling when element is just slightly off-screen
        // and prevents jumping to wrong pages
        const margin = 50
        const isSignificantlyOutOfView = rect.bottom < -margin || 
                                        rect.top > viewportHeight + margin || 
                                        rect.right < -margin || 
                                        rect.left > viewportWidth + margin
        
        if (isSignificantlyOutOfView) {
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
          elementToScroll.scrollIntoView({ behavior: 'smooth', block: 'center' })
          // Reset flag after scroll animation completes (smooth scroll can take up to 1000ms)
          setTimeout(() => {
            isProgrammaticScrollRef.current = false
          }, 1100)
        }
      }, 50) // Small debounce to prevent rapid scroll calls
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

  // Highlight the element currently being read
  const highlightCurrentReading = (position) => {
    // Use requestAnimationFrame to ensure DOM is ready, especially after quick restarts
    requestAnimationFrame(() => {
      // Use ref to get latest textItems (important for event handlers)
      const currentTextItems = textItemsRef.current
      if (!currentTextItems || currentTextItems.length === 0) return
      
      // Find all text items that contain this position (might have duplicates across pages)
      const matchingItems = currentTextItems.filter(item => 
        item.charIndex <= position && 
        item.charIndex + item.str.length >= position
      )

      if (matchingItems.length === 0) return

      // Prefer items that are currently visible in the viewport
      let itemAtPosition = matchingItems.find(item => {
        if (!item.element || !item.element.isConnected) return false
        return isElementInViewport(item.element)
      })

      // If no visible item found, prefer the one with the highest charIndex (most specific match)
      // This helps avoid matching items from different pages
      if (!itemAtPosition) {
        itemAtPosition = matchingItems.sort((a, b) => b.charIndex - a.charIndex)[0]
      }

      if (itemAtPosition && itemAtPosition.element) {
        const element = itemAtPosition.element
        
        // Check if element is still in DOM (might have been re-rendered)
        if (!element.isConnected) {
          // Element was removed from DOM, try to find it again
          const pageNum = itemAtPosition.page
          const textLayer = textLayerRefs.current[pageNum]
          if (textLayer) {
            const newElement = textLayer.querySelector(`[data-char-index="${itemAtPosition.charIndex}"][data-page="${pageNum}"]`)
            if (newElement) {
              // Update the reference
              itemAtPosition.element = newElement
              currentTextItems.forEach(item => {
                if (item.charIndex === itemAtPosition.charIndex && item.page === pageNum) {
                  item.element = newElement
                }
              })
              // Use the new element
              applyReadingHighlight(newElement)
              return
            }
          }
          return
        }
        
        // Verify the element's page matches the item's page
        const elementPage = getElementPageNumber(element)
        if (elementPage !== null && elementPage !== itemAtPosition.page) {
          // Page mismatch - element might be from wrong page, try to find correct one
          const textLayer = textLayerRefs.current[itemAtPosition.page]
          if (textLayer) {
            const correctElement = textLayer.querySelector(`[data-char-index="${itemAtPosition.charIndex}"][data-page="${itemAtPosition.page}"]`)
            if (correctElement) {
              itemAtPosition.element = correctElement
              applyReadingHighlight(correctElement)
              return
            }
          }
          return
        }
        
        applyReadingHighlight(element)
      }
    })
  }

  const handleWordClick = (charIndex, word) => {
    // Find the start of the word in the full text
    const wordStart = findWordStart(extractedText, charIndex)
    
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
    
    // Find and mark the clicked word (use ref to get latest textItems)
    const currentTextItems = textItemsRef.current.length > 0 ? textItemsRef.current : textItems
    const clickedItem = currentTextItems.find(item => 
      item.charIndex <= charIndex && 
      item.charIndex + item.str.length >= charIndex
    )
    if (clickedItem && clickedItem.element) {
      markStartPosition(clickedItem.element)
    }
    
    // Always start reading immediately from the new position
    if (extractedText) {
      const delay = wasPlaying ? 100 : 0
      setTimeout(() => {
        // Ensure speech is fully stopped before restarting (for browser TTS)
        if (wasPlaying && synthRef.current && synthRef.current.speaking) {
          synthRef.current.cancel()
          setTimeout(() => {
            // Reset boundary tracking before restart
            previousBoundaryPositionRef.current = null
            startPlaybackFromPosition(wordStart)
          }, 50)
          return
        }
        
        // Reset boundary tracking before starting
        previousBoundaryPositionRef.current = null
        
        // Start playback from the new position
        const success = startPlaybackFromPosition(wordStart)
        if (!success) {
          setError('No text to read from the selected position.')
        }
      }, delay)
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

  const findWordStart = (text, position) => {
    if (position <= 0) return 0
    if (position >= text.length) return text.length
    
    let start = position
    
    // Move backwards to find word start
    while (start > 0 && /\S/.test(text[start - 1])) {
      start--
    }
    
    // If we're at whitespace, move forward to next word
    while (start < text.length && /\s/.test(text[start])) {
      start++
    }
    
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

    try {
      const arrayBuffer = await file.arrayBuffer()
      // Clone the ArrayBuffer to prevent it from being detached when PDF.js uses it
      pdfArrayBufferRef.current = arrayBuffer.slice(0)
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      setPdfDoc(pdf)
      setTotalPages(pdf.numPages)
      setHighlights([]) // Clear highlights when loading new PDF
      setHighlightHistory([[]]) // Reset history
      setHistoryIndex(0)
      historyIndexRef.current = 0

      // Extract all text, filtering out headers and footers using repetition detection
      // First, build a map of text repetition across pages
      const { textToPages, pageTextItems } = await buildRepetitionMap(pdf, pdf.numPages)
      
      // Then filter each page based on repetition
      let fullText = ''
      for (const pageData of pageTextItems) {
        const filteredItems = filterHeadersAndFooters(pageData, textToPages)
        const pageText = filteredItems.map(item => item.str).join(' ')
        fullText += pageText + '\n\n'
      }

      const finalText = fullText.trim()
      setExtractedText(finalText)
      
      // Auto-detect language
      if (language === 'auto' && finalText) {
        const detected = detectLanguage(finalText)
        console.log('Detected language:', detected, 'for text length:', finalText.length)
        setDetectedLanguage(detected)
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
        // Small delay to let Chrome process the cancellation
        return new Promise(resolve => setTimeout(resolve, 100))
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

    // TEMPORARILY: Use browser TTS for both languages (Google TTS disabled for debugging)
    // Use Google TTS for Spanish, browser TTS for English
    console.log('Starting playback, language:', langToUse, 'text length:', textToRead.length)
    if (false && langToUse === 'es') {
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

      // Create new utterance
      const utterance = new SpeechSynthesisUtterance(textToRead)
      // Set language based on detected language (use Spanish voice for Spanish, English for English)
      utterance.lang = langToUse === 'es' ? 'es-ES' : 'en-US'
      utterance.rate = playbackSpeed
      utterance.pitch = 1.0
      utterance.volume = 1.0

      // Track if utterance actually starts (Chrome can silently reject)
      let utteranceStarted = false
      let utteranceStartTimeout = null

      // Track position using boundary events (fires when speaking each word)
      utterance.onboundary = (event) => {
        if (event.name === 'word' || event.name === 'sentence') {
          // Calculate the character position based on the text being spoken
          // event.charIndex is relative to the utterance text, so add the start position
          const absolutePosition = position + event.charIndex
          currentPlaybackPositionRef.current = absolutePosition
          lastBoundaryPositionRef.current = absolutePosition
          
          // When a boundary event fires at position X, it means we're STARTING to speak the word at X
          // However, there's often a slight delay, so we should highlight the word we were just speaking
          // (the previous boundary position) to show what's currently being spoken
          let positionToHighlight
          
          if (previousBoundaryPositionRef.current !== null && previousBoundaryPositionRef.current !== position) {
            // Highlight the word at the previous boundary (the one we were just speaking)
            // Find the start of that word
            positionToHighlight = findWordStart(extractedText, previousBoundaryPositionRef.current)
          } else {
            // First boundary or no previous position - highlight the starting word
            positionToHighlight = findWordStart(extractedText, position)
          }
          
          // Highlight the word currently being read
          highlightCurrentReading(positionToHighlight)
          
          // Update previous position for next boundary event
          previousBoundaryPositionRef.current = absolutePosition
        }
      }

      utterance.onstart = () => {
        utteranceStarted = true
        if (utteranceStartTimeout) {
          clearTimeout(utteranceStartTimeout)
          utteranceStartTimeout = null
        }
        
        setIsPlaying(true)
        // Ensure position is tracked
        currentPlaybackPositionRef.current = position
        playbackStartPositionRef.current = position
        playbackStartTimeRef.current = Date.now()
        lastBoundaryPositionRef.current = position
        previousBoundaryPositionRef.current = position // Initialize previous position
        
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
      utterance.onend = () => {
        if (utteranceStartTimeout) {
          clearTimeout(utteranceStartTimeout)
          utteranceStartTimeout = null
        }
        
        setIsPlaying(false)
        // Update position to end when finished
        currentPlaybackPositionRef.current = extractedText.length
        playbackStartTimeRef.current = null
        
        // Clear the reading highlight
        clearReadingHighlight()
        
        // Update Media Session metadata
        // Keep as 'paused' instead of 'none' so macOS continues to route media keys
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused'
          console.log('Media Session playbackState set to "paused" (end)')
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
          if (!utteranceStarted && utteranceRef.current === utterance) {
            console.warn('Utterance may have been rejected by browser (Chrome issue)')
            setError('Speech synthesis failed to start. This can happen in Chrome. Try refreshing the page or using a different browser.')
            setIsPlaying(false)
            utteranceRef.current = null
            clearReadingHighlight()
          }
        }, 500)
        
        return true
      } catch (error) {
        console.error('Error calling speech synthesis speak():', error)
        setError('Error starting speech: ' + error.message)
        utteranceRef.current = null
        return false
      }
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
        playbackStartTimeRef.current = null
        // Keep currentPlaybackPositionRef at current value (don't reset)
        
        // Clear the reading highlight
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
    const allSpans = textLayerDiv.querySelectorAll('span')
    
    // Process each span to find the precise selected portion
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
      
      // Calculate precise bounding box for the selected portion
      if (startOffset < endOffset && startOffset >= 0 && endOffset <= textNode.textContent.length) {
        // Get the span's style properties (already relative to text layer)
        const spanLeft = parseFloat(span.style.left) || 0
        const spanTop = parseFloat(span.style.top) || 0
        const fontSize = parseFloat(span.style.fontSize) || 12
        const fontFamily = span.style.fontFamily || 'sans-serif'
        
        // Get the selected text portion
        const selectedText = textNode.textContent.substring(startOffset, endOffset)
        const textBeforeSelection = textNode.textContent.substring(0, startOffset)
        
        // Measure text width to calculate precise position
        const textBeforeWidth = measureTextWidth(textBeforeSelection, fontFamily, fontSize)
        const selectedTextWidth = measureTextWidth(selectedText, fontFamily, fontSize)
        
        // Get the span's transform to account for rotation
        const transform = span.style.transform
        let angle = 0
        if (transform && transform !== 'none') {
          // Extract rotation angle from transform string (e.g., "rotate(0.1rad)")
          const match = transform.match(/rotate\(([^)]+)\)/)
          if (match) {
            const angleStr = match[1]
            if (angleStr.includes('rad')) {
              angle = parseFloat(angleStr)
            } else if (angleStr.includes('deg')) {
              angle = parseFloat(angleStr) * Math.PI / 180
            }
          }
        }
        
        // Calculate precise rectangle - return as separate rectangle, not combined
        if (Math.abs(angle) < 0.001) {
          // No rotation - simple case: calculate precise position based on text measurement
          rects.push({
            x: spanLeft + textBeforeWidth,
            y: spanTop,
            width: selectedTextWidth,
            height: fontSize
          })
        } else {
          // For rotated text, use the full span
          const fullTextWidth = measureTextWidth(textNode.textContent, fontFamily, fontSize)
          rects.push({
            x: spanLeft,
            y: spanTop,
            width: fullTextWidth,
            height: fontSize
          })
        }
      }
    })
    
    // Fallback to getClientRects if no spans were processed
    if (rects.length === 0) {
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
    }
    
    return rects.length > 0 ? rects : null
  }

  // Handle text selection to create highlights (only in highlight mode)
  useEffect(() => {
    const handleMouseUp = () => {
      // Only process selections in highlight mode
      if (interactionMode !== 'highlight') return
      
      const selection = window.getSelection()
      if (selection.toString().trim().length > 0 && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        const selectedText = selection.toString().trim()
        
        if (selectedText.length === 0) return
        
        // Find the page by checking the common ancestor
        let startElement = range.startContainer
        while (startElement && startElement.nodeType !== Node.ELEMENT_NODE) {
          startElement = startElement.parentElement
        }
        
        // Try to find page number from start element or its parents
        let pageNum = null
        let currentElement = startElement
        while (currentElement && !pageNum) {
          if (currentElement.dataset && currentElement.dataset.page) {
            pageNum = parseInt(currentElement.dataset.page)
            break
          }
          currentElement = currentElement.parentElement
        }
        
        // If not found, check all text layers
        if (!pageNum) {
          for (const [page, textLayer] of Object.entries(textLayerRefs.current)) {
            if (textLayer && textLayer.contains(range.startContainer)) {
              pageNum = parseInt(page)
              break
            }
          }
        }
        
        if (pageNum && textLayerRefs.current[pageNum]) {
          const textLayerDiv = textLayerRefs.current[pageNum]
          
          // Calculate precise rectangles (one per line segment)
          const rectangles = calculatePreciseRectangles(range, textLayerDiv)
          
          if (rectangles && rectangles.length > 0) {
            // Get page info to store scale
            const pageInfo = pageData.find(p => p.pageNum === pageNum)
            const scale = pageInfo ? pageScale : 1.5
            
            // Create highlight with array of rectangles
            const highlight = {
              id: Date.now() + Math.random(),
              page: pageNum,
              rects: rectangles, // Array of {x, y, width, height}
              text: selectedText,
              scale // Store the scale at creation time
            }
            
            // Add to history for undo/redo
            setHighlights(prev => {
              const newHighlights = [...prev, highlight]
              // Update history: remove any future states if we're not at the end
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
            selection.removeAllRanges()
          }
        }
      }
    }

    // Add a small delay to ensure selection is complete
    const timeoutId = setTimeout(() => {
      document.addEventListener('mouseup', handleMouseUp)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [textItems, pageData, pageScale, interactionMode])

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
  }, [highlights, pageData, renderedPages, pageScale])

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
      // Only handle if in highlight mode and not typing in an input
      if (interactionMode !== 'highlight') return
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
  }, [interactionMode, handleUndoHighlight, handleRedoHighlight])

  const renderHighlight = (highlight, highlightLayer) => {
    // Check if highlight already rendered
    const existingHighlight = highlightLayer.querySelector(`[data-highlight-id="${highlight.id}"]`)
    if (existingHighlight) return

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
    
    // Render each rectangle separately
    rects.forEach((rect, index) => {
      const x = rect.x * scaleRatio
      const y = rect.y * scaleRatioY
      const width = rect.width * scaleRatio
      const height = rect.height * scaleRatioY

      const div = document.createElement('div')
      div.className = 'highlight-rect'
      div.dataset.highlightId = highlight.id
      div.dataset.rectIndex = index
      div.style.position = 'absolute'
      div.style.left = x + 'px'
      div.style.top = y + 'px'
      div.style.width = width + 'px'
      div.style.height = height + 'px'
      div.style.backgroundColor = 'rgba(251, 188, 4, 0.3)'
      div.style.pointerEvents = 'none'
      div.style.zIndex = '1'
      
      highlightLayer.appendChild(div)
    })
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
        pages = []
        for (let i = 0; i < sourcePdfDoc.getPageCount(); i++) {
          const sourcePage = sourcePdfDoc.getPage(i)
          const { width, height } = sourcePage.getSize()
          
          // Render page to canvas using PDF.js (which we already have loaded in state)
          const pdfjsPage = await pdfDoc.getPage(i + 1) // pdfDoc state is PDF.js document, 1-indexed
          const viewport = pdfjsPage.getViewport({ scale: 2.0 }) // Higher scale for better quality
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
                // Add highlight annotation using a blend mode that works better with PDFs
                page.drawRectangle({
                  x: pdfX,
                  y: pdfY,
                  width: pdfWidth,
                  height: pdfHeight,
                  color: rgb(1, 1, 0), // Yellow
                  opacity: 0.3,
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
          <div className="zoom-controls">
            <button
              onClick={() => setPageScale(Math.max(0.5, pageScale - 0.25))}
              className="btn-zoom"
              disabled={pageScale <= 0.5}
              title="Zoom out"
            >
              <IconZoomOut size={16} />
            </button>
            <span className="zoom-level">{Math.round(pageScale * 100)}%</span>
            <button
              onClick={() => setPageScale(Math.min(3.0, pageScale + 0.25))}
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

      {/* Main PDF Viewer Area */}
      <div className="reader-main">
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
          {isControlsPanelMinimized ? (
            <div 
              className={`reader-controls-panel-minimized ${isHoveringMinimizedPanel ? 'hovered' : ''}`}
              onMouseEnter={() => setIsHoveringMinimizedPanel(true)}
              onMouseLeave={() => setIsHoveringMinimizedPanel(false)}
              onClick={() => setIsControlsPanelMinimized(false)}
            >
              <IconSpeaker size={16} />
            </div>
          ) : (
            <div className="reader-controls-panel">
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
              <label htmlFor="language-select">Language</label>
              <select
                id="language-select"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="language-select"
                disabled={isPlaying}
              >
                <option value="auto">
                  Auto {detectedLanguage && `(${detectedLanguage === 'es' ? 'ES' : 'EN'})`}
                </option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>

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

            {interactionMode === 'highlight' && highlights.length > 0 && (
              <div className="control-group">
                <div className="highlights-count">
                  {highlights.length} highlight{highlights.length !== 1 ? 's' : ''}
                </div>
                <button
                  onClick={handleDownloadPdf}
                  className="btn btn-primary btn-small"
                  disabled={isLoading || highlights.length === 0}
                >
                  <IconDownload size={16} />
                  <span>Download Highlighted PDF</span>
                </button>
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
              <button
                onClick={handleStop}
                className="btn btn-secondary btn-small btn-stop"
                disabled={!isPlaying}
              >
                <IconStop size={16} />
                <span>Stop</span>
              </button>
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
