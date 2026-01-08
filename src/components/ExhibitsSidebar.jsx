import React, { useState, useEffect, useRef } from 'react'
import { IconFileText, IconLoading, IconClose, IconChevronLeft } from './Icons.jsx'
import { extractExhibits } from '../../services/chunking.js'
import { validateExhibitName, parseExhibitName } from '../../services/exhibitValidation.js'

// Sidebar tab: exhibits insights
const ExhibitsSidebar = ({
  extractedText,
  pdfDoc,
  documentId,
  isPDFProcessing,
  pageData,
  isExpanded,
  setIsExpanded,
  sidebarWidth,
  setSidebarWidth,
  onExhibitClick
}) => {
  const [exhibits, setExhibits] = useState([])
  const [selectedExhibit, setSelectedExhibit] = useState(null)
  const [exhibitContent, setExhibitContent] = useState(null)
  const [isLoadingContent, setIsLoadingContent] = useState(false)
  const [exhibitImages, setExhibitImages] = useState({}) // Store exhibit images by exhibit key
  const [validatingExhibits, setValidatingExhibits] = useState(false) // Track validation progress
  const [validationComplete, setValidationComplete] = useState(false) // Track if validation has completed
  const [rawExhibits, setRawExhibits] = useState([]) // Store raw exhibits before validation
  const selectedExhibitRef = useRef(null) // Ref to track selected exhibit for external selection
  
  // Zoom and pan state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const imageContainerRef = useRef(null)
  const imageRef = useRef(null)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const lastPinchDistanceRef = useRef(null)
  const lastPinchCenterRef = useRef(null)

  // Extract exhibits from text when text is available
  useEffect(() => {
    if (extractedText && extractedText.length > 0 && !isPDFProcessing) {
      const extracted = extractExhibits(extractedText)
      
      // Post-process: if pageData is available, group exhibits by page
      // and if multiple exhibits are on the same page, prefer the earliest one
      // This prevents cases where a page titled "Exhibit 10" also contains
      // a reference to "Exhibit 8" in a table, and we incorrectly show "Exhibit 8"
      let filteredExhibits = []
      if (pageData && pageData.length > 0) {
        const exhibitsByPage = new Map()
        
        extracted.forEach(exhibit => {
          // Find which page this exhibit is on based on its character position
          let exhibitPage = 1
          for (let i = 0; i < pageData.length; i++) {
            const pageInfo = pageData[i]
            const nextPageInfo = pageData[i + 1]
            if (exhibit.position >= pageInfo.pageCharOffset) {
              if (!nextPageInfo || exhibit.position < nextPageInfo.pageCharOffset) {
                exhibitPage = pageInfo.pageNum
                break
              }
            }
          }
          
          // Fallback: check if it's on the last page
          if (exhibitPage === 1 && pageData.length > 0) {
            const lastPage = pageData[pageData.length - 1]
            if (exhibit.position >= lastPage.pageCharOffset) {
              exhibitPage = lastPage.pageNum
            }
          }
          
          if (!exhibitsByPage.has(exhibitPage)) {
            exhibitsByPage.set(exhibitPage, [])
          }
          exhibitsByPage.get(exhibitPage).push(exhibit)
        })
        
        // For pages with multiple exhibits, keep only the earliest one
        // The earliest exhibit on a page is most likely the main title/header
        exhibitsByPage.forEach((pageExhibits, pageNum) => {
          if (pageExhibits.length > 1) {
            // Multiple exhibits on same page - prefer the earliest (main title)
            pageExhibits.sort((a, b) => a.position - b.position)
            filteredExhibits.push(pageExhibits[0])
          } else {
            filteredExhibits.push(pageExhibits[0])
          }
        })
        
        // Sort final exhibits by position to ensure consistent ordering
        filteredExhibits.sort((a, b) => a.position - b.position)
      } else {
        // No pageData available, use exhibits as-is
        filteredExhibits = extracted.sort((a, b) => a.position - b.position)
      }
      
      // Store raw exhibits and reset validation state
      setRawExhibits(filteredExhibits)
      setExhibits([]) // Clear validated exhibits until validation completes
      setValidationComplete(false) // Reset validation state
    } else {
      setRawExhibits([])
      setExhibits([])
      setValidationComplete(false)
    }
  }, [extractedText, isPDFProcessing, pageData])

  // Validate exhibit names using AI vision after exhibits are extracted and PDF is ready
  useEffect(() => {
    // Only validate if we have raw exhibits, PDF is ready, and validation hasn't completed yet
    if (!rawExhibits.length || !pdfDoc || isPDFProcessing || validatingExhibits || validationComplete) {
      return
    }

    const validateExhibits = async () => {
      setValidatingExhibits(true)
      
      try {
        const validatedExhibits = await Promise.all(
          rawExhibits.map(async (exhibit) => {
            try {
              // Find which page contains this exhibit
              const exhibitPosition = exhibit.position
              let targetPageNum = 1
              
              if (pageData && pageData.length > 0) {
                for (let i = 0; i < pageData.length; i++) {
                  const pageInfo = pageData[i]
                  const nextPageInfo = pageData[i + 1]
                  if (exhibitPosition >= pageInfo.pageCharOffset) {
                    if (!nextPageInfo || exhibitPosition < nextPageInfo.pageCharOffset) {
                      targetPageNum = pageInfo.pageNum
                      break
                    }
                  }
                }
                
                if (targetPageNum === 1 && pageData.length > 0) {
                  const lastPage = pageData[pageData.length - 1]
                  if (exhibitPosition >= lastPage.pageCharOffset) {
                    targetPageNum = lastPage.pageNum
                  }
                }
              } else {
                targetPageNum = Math.ceil((exhibitPosition / extractedText.length) * pdfDoc.numPages)
                targetPageNum = Math.max(1, Math.min(targetPageNum, pdfDoc.numPages))
              }

              // Render the page as an image
              const page = await pdfDoc.getPage(targetPageNum - 1)
              const scale = 2.0
              const viewport = page.getViewport({ scale: scale })
              const canvas = document.createElement('canvas')
              const context = canvas.getContext('2d')
              canvas.width = viewport.width
              canvas.height = viewport.height
              
              await page.render({
                canvasContext: context,
                viewport: viewport
              }).promise
              
              const imageDataUrl = canvas.toDataURL('image/png')
              
              // Format the extracted exhibit name for validation
              const formatExhibitName = (ex) => {
                const typeMap = {
                  'exhibit': 'Exhibit',
                  'anexo': 'Anexo',
                  'prueba': 'Prueba',
                  'evidencia': 'Evidencia',
                  'documento': 'Documento'
                }
                const typeName = typeMap[ex.type] || ex.type
                return `${typeName} ${ex.number}`
              }
              
              const extractedName = formatExhibitName(exhibit)
              
              // Validate with AI
              const validationResult = await validateExhibitName(imageDataUrl, extractedName)
              
              // If validation found a different name, update the exhibit
              if (validationResult.success && 
                  validationResult.validated && 
                  validationResult.exhibitName &&
                  !validationResult.matches) {
                const parsed = parseExhibitName(validationResult.exhibitName)
                if (parsed.type && parsed.number) {
                  console.log(`Validated exhibit: "${extractedName}" -> "${validationResult.exhibitName}"`)
                  return {
                    ...exhibit,
                    type: parsed.type,
                    number: parsed.number,
                    fullText: validationResult.exhibitName,
                    validated: true,
                    originalName: extractedName
                  }
                }
              }
              
              // Return original exhibit (either validated as correct or validation failed)
              return {
                ...exhibit,
                validated: validationResult.validated || false
              }
            } catch (error) {
              console.error(`Error validating exhibit ${exhibit.type} ${exhibit.number}:`, error)
              // Return original exhibit if validation fails
              return { ...exhibit, validated: false }
            }
          })
        )
        
        // Update exhibits with validated names
        setExhibits(validatedExhibits)
        setValidationComplete(true) // Mark validation as complete
      } catch (error) {
        console.error('Error during exhibit validation:', error)
        // On error, show raw exhibits anyway
        setExhibits(rawExhibits)
        setValidationComplete(true) // Mark as complete even on error to prevent retries
      } finally {
        setValidatingExhibits(false)
      }
    }

    // Small delay to ensure PDF is fully loaded
    const timeoutId = setTimeout(() => {
      validateExhibits()
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [rawExhibits, pdfDoc, isPDFProcessing, validationComplete])

  // Listen for external exhibit selection (from text layer clicks)
  useEffect(() => {
    const handleSelectExhibit = (event) => {
      const { exhibit } = event.detail
      if (exhibit) {
        // Find matching exhibit from our list
        const matchingExhibit = exhibits.find(e => 
          e.type === exhibit.type && 
          e.number.toLowerCase() === exhibit.number.toLowerCase() &&
          e.position === exhibit.position
        )
        if (matchingExhibit) {
          setSelectedExhibit(matchingExhibit)
          selectedExhibitRef.current = matchingExhibit
          // Auto-expand when exhibit is selected from text
          if (setIsExpanded) {
            setIsExpanded(true)
            // Set sidebar width to 50vw (middle of page) if not already expanded
            if (!isExpanded && setSidebarWidth) {
              const targetWidth = Math.floor(window.innerWidth * 0.5)
              setSidebarWidth(targetWidth)
            }
          }
        }
      }
    }
    
    window.addEventListener('selectExhibit', handleSelectExhibit)
    return () => {
      window.removeEventListener('selectExhibit', handleSelectExhibit)
    }
  }, [exhibits, isExpanded, setIsExpanded, setSidebarWidth])

  // Extract exhibit content (text and images) when an exhibit is selected
  useEffect(() => {
    if (selectedExhibit && pdfDoc && extractedText) {
      extractExhibitContent(selectedExhibit)
      // Reset zoom and pan when new exhibit is selected
      setZoom(1)
      setPan({ x: 0, y: 0 })
      setImageSize({ width: 0, height: 0 })
      // Reset scroll position
      if (imageContainerRef.current) {
        imageContainerRef.current.scrollLeft = 0
        imageContainerRef.current.scrollTop = 0
      }
    }
  }, [selectedExhibit, pdfDoc, extractedText])
  
  // Dynamically update viewport meta tag to prevent page zoom when viewing exhibits
  useEffect(() => {
    const viewportMeta = document.querySelector('meta[name="viewport"]')
    const originalContent = viewportMeta ? viewportMeta.getAttribute('content') : null
    
    if (selectedExhibit) {
      // When viewing exhibit, disable page zoom by setting user-scalable=no
      if (viewportMeta) {
        const newContent = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
        viewportMeta.setAttribute('content', newContent)
      }
    } else {
      // Restore original viewport when not viewing exhibit
      if (viewportMeta && originalContent) {
        viewportMeta.setAttribute('content', originalContent)
      }
    }
    
    return () => {
      // Restore original viewport on cleanup
      if (viewportMeta && originalContent) {
        viewportMeta.setAttribute('content', originalContent)
      }
    }
  }, [selectedExhibit])
  
  // Recalculate image size when exhibit content changes and image is loaded
  useEffect(() => {
    if (exhibitContent?.pageImage && imageRef.current && imageContainerRef.current) {
      const img = imageRef.current
      const container = imageContainerRef.current
      
      // Function to calculate and set image size
      const calculateImageSize = () => {
        if (img.complete && img.naturalWidth > 0 && container.clientWidth > 0) {
          const naturalWidth = img.naturalWidth
          const naturalHeight = img.naturalHeight
          const containerWidth = container.clientWidth - 16 // Account for padding
          // Use at least 80% of container width to ensure it's visible
          const minDisplayWidth = Math.max(containerWidth * 0.8, 400)
          const displayedWidth = Math.max(
            Math.min(naturalWidth, containerWidth),
            minDisplayWidth
          )
          const aspectRatio = naturalHeight / naturalWidth
          const displayedHeight = displayedWidth * aspectRatio
          
          setImageSize({
            width: displayedWidth,
            height: displayedHeight
          })
        }
      }
      
      // If image is already loaded, calculate immediately
      if (img.complete && img.naturalWidth > 0) {
        // Wait for container to have width
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            calculateImageSize()
          })
        })
      } else {
        // Wait for image to load
        img.addEventListener('load', calculateImageSize, { once: true })
      }
      
      // Also listen for container resize
      const resizeObserver = new ResizeObserver(() => {
        if (img.complete && img.naturalWidth > 0) {
          calculateImageSize()
        }
      })
      resizeObserver.observe(container)
      
      return () => {
        img.removeEventListener('load', calculateImageSize)
        resizeObserver.disconnect()
      }
    }
  }, [exhibitContent?.pageImage])
  
  // Add document-level touch listener when near max zoom to prevent page zoom
  // ALWAYS block when viewing an exhibit, regardless of zoom level
  useEffect(() => {
    const MAX_ZOOM = 5
    // Activate document-level blocking when zoom is >= 4.5 to prevent browser from starting native zoom
    // But also block ALL touch events when viewing an exhibit to prevent page zoom
    const BLOCK_THRESHOLD = 4.5
    const shouldBlock = zoom >= BLOCK_THRESHOLD || selectedExhibit // Block all touches when viewing exhibit
    
    if (!selectedExhibit) return // Only block when viewing exhibit
    
    // Helper function to check if event target is within exhibit container
    const isWithinExhibitContainer = (target) => {
      if (!imageContainerRef.current || !target) return false
      return imageContainerRef.current.contains(target)
    }
    
    const handleDocumentTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
      }
    }
    
    const handleDocumentTouchMove = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
      }
    }
    
    const handleDocumentWheel = (e) => {
      // Only handle Ctrl/Cmd + wheel zoom
      if (!(e.ctrlKey || e.metaKey) || e.deltaY >= 0) return
      
      const isWithinExhibit = isWithinExhibitContainer(e.target)
      const MAX_ZOOM = 5
      const ZOOM_EPSILON = 0.001
      const BLOCK_THRESHOLD = 4.5 // Block earlier to prevent browser from starting native zoom
      const isAtMaxZoom = zoom >= (MAX_ZOOM - ZOOM_EPSILON)
      const isNearMax = zoom >= BLOCK_THRESHOLD
      
      // Calculate what newZoom would be (same calculation as component's handleWheel)
      const rawDelta = e.deltaY > 0 ? 0.9 : 1.1
      const delta = 1 + (rawDelta - 1) / 19
      const newZoom = Math.max(0.5, Math.min(5, zoom * delta))
      const wouldReachMax = newZoom >= (MAX_ZOOM - ZOOM_EPSILON)
      const isZoomingIn = e.deltaY < 0
      
      // ALWAYS prevent default on Ctrl/Cmd + wheel when viewing an exhibit to prevent page zoom
      // The component's handleWheel will still work because it's attached to the container element
      // Block if:
      // 1. Event is NOT within exhibit container (prevent page zoom)
      // 2. OR we're at/near max zoom and trying to zoom in (prevent overflow even within exhibit)
      // 3. OR event is within exhibit (prevent browser from also handling it natively)
      const shouldBlock = !isWithinExhibit || ((isAtMaxZoom || (isNearMax && wouldReachMax)) && isZoomingIn) || isWithinExhibit
      
      if (shouldBlock) {
        // Only prevent default to stop browser zoom, but allow event to propagate to component's handleWheel
        e.preventDefault()
        // Don't call stopPropagation() or stopImmediatePropagation() - let event reach component handler
      }
    }
    
    // Use capture phase to catch events before they reach other handlers
    document.addEventListener('touchstart', handleDocumentTouchStart, { capture: true, passive: false })
    document.addEventListener('touchmove', handleDocumentTouchMove, { capture: true, passive: false })
    document.addEventListener('wheel', handleDocumentWheel, { capture: true, passive: false })
    
    return () => {
      document.removeEventListener('touchstart', handleDocumentTouchStart, { capture: true })
      document.removeEventListener('touchmove', handleDocumentTouchMove, { capture: true })
      document.removeEventListener('wheel', handleDocumentWheel, { capture: true })
    }
  }, [zoom, selectedExhibit])
  
  // Handle pinch-to-zoom and pan gestures
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      // Pinch gesture - prevent default to avoid conflicts
      // If at max zoom, prevent default and stop propagation to block page zoom
      const MAX_ZOOM = 5
      const ZOOM_EPSILON = 0.001
      const BLOCK_THRESHOLD = 4.5 // Block earlier to prevent browser from starting native zoom
      const isAtMaxZoom = zoom >= (MAX_ZOOM - ZOOM_EPSILON)
      const isNearMax = zoom >= BLOCK_THRESHOLD
      
      // Block if at or near max zoom to prevent browser from starting native zoom
      if (isAtMaxZoom || isNearMax) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        // Still initialize distance tracking for potential zoom out
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        )
        lastPinchDistanceRef.current = distance
        return
      }
      
      e.preventDefault()
      e.stopPropagation()
      
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      const centerX = (touch1.clientX + touch2.clientX) / 2
      const centerY = (touch1.clientY + touch2.clientY) / 2
      
      lastPinchDistanceRef.current = distance
      if (imageContainerRef.current) {
        const rect = imageContainerRef.current.getBoundingClientRect()
        lastPinchCenterRef.current = {
          x: centerX - rect.left,
          y: centerY - rect.top
        }
      }
    } else if (e.touches.length === 1 && zoom > 1) {
      // Single touch drag when zoomed
      setIsDragging(true)
      if (imageContainerRef.current) {
        const container = imageContainerRef.current
        const rect = container.getBoundingClientRect()
        setDragStart({
          x: e.touches[0].clientX,
          y: e.touches[0].clientY
        })
      }
    }
  }
  
  const handleTouchMove = (e) => {
    if (e.touches.length === 2) {
      // Pinch gesture - always prevent default to avoid overflow to rest of app
      e.preventDefault()
      e.stopPropagation()
      
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      )
      
      if (lastPinchDistanceRef.current && imageContainerRef.current) {
        // Decrease sensitivity (19x less sensitive than original)
        // This means the scale change should be divided by 19
        const rawScaleChange = distance / lastPinchDistanceRef.current
        // Make it 19x less sensitive: if distance doubles, zoom only increases by 1/19 of that
        const scaleChange = 1 + (rawScaleChange - 1) / 19
        
        const newZoom = Math.max(0.5, Math.min(5, zoom * scaleChange))
        
        // Check if we're at max zoom and trying to zoom in more
        // Use a small epsilon to account for floating point precision
        const MAX_ZOOM = 5
        const ZOOM_EPSILON = 0.001
        const isAtMaxZoom = zoom >= (MAX_ZOOM - ZOOM_EPSILON)
        const isZoomingIn = scaleChange > 1
        const wouldExceedMax = newZoom >= (MAX_ZOOM - ZOOM_EPSILON) && isZoomingIn
        
        // Always prevent default for pinch gestures, especially at max zoom
        // Check both current zoom and if new zoom would exceed max
        if ((isAtMaxZoom || wouldExceedMax) && isZoomingIn) {
          // At max zoom and trying to zoom in - prevent overflow but don't update zoom
          // Ensure preventDefault and stopPropagation are called (already called above)
          lastPinchDistanceRef.current = distance
          return
        }
        
        // Adjust scroll position to zoom towards pinch center
        if (lastPinchCenterRef.current && imageContainerRef.current) {
          const container = imageContainerRef.current
          const rect = container.getBoundingClientRect()
          const scrollLeft = container.scrollLeft
          const scrollTop = container.scrollTop
          const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left + scrollLeft
          const centerY = (touch1.clientY + touch2.clientY) / 2 - rect.top + scrollTop
          
          const zoomChange = newZoom / zoom
          const newScrollLeft = centerX - (centerX - scrollLeft) * zoomChange
          const newScrollTop = centerY - (centerY - scrollTop) * zoomChange
          
          setZoom(newZoom)
          
          // Update scroll position after zoom
          requestAnimationFrame(() => {
            if (imageContainerRef.current) {
              imageContainerRef.current.scrollLeft = newScrollLeft
              imageContainerRef.current.scrollTop = newScrollTop
            }
          })
        } else {
          setZoom(newZoom)
        }
        
        lastPinchDistanceRef.current = distance
      }
    } else if (e.touches.length === 1 && isDragging && zoom > 1) {
      // Single touch drag - prevent default to avoid page scrolling
      e.preventDefault()
      // Update scroll directly
      if (imageContainerRef.current) {
        const container = imageContainerRef.current
        const rect = container.getBoundingClientRect()
        const startScrollLeft = container.scrollLeft
        const startScrollTop = container.scrollTop
        const startX = dragStart.x - rect.left
        const startY = dragStart.y - rect.top
        const currentX = e.touches[0].clientX - rect.left
        const currentY = e.touches[0].clientY - rect.top
        
        container.scrollLeft = startScrollLeft - (currentX - startX)
        container.scrollTop = startScrollTop - (currentY - startY)
      }
    }
  }
  
  const handleTouchEnd = () => {
    setIsDragging(false)
    lastPinchDistanceRef.current = null
    lastPinchCenterRef.current = null
  }
  
  // Handle mouse wheel zoom and scroll panning
  const handleWheel = (e) => {
    // Ctrl/Cmd + wheel = zoom
    if (e.ctrlKey || e.metaKey) {
      const MAX_ZOOM = 5
      const ZOOM_EPSILON = 0.001
      const isZoomingIn = e.deltaY < 0 // Negative deltaY means zoom in
      
      // Calculate what the new zoom would be
      const rawDelta = e.deltaY > 0 ? 0.9 : 1.1
      const delta = 1 + (rawDelta - 1) / 19
      const newZoom = Math.max(0.5, Math.min(5, zoom * delta))
      
      // Check if we're at or would reach max zoom and trying to zoom in
      const isAtMaxZoom = zoom >= (MAX_ZOOM - ZOOM_EPSILON)
      const wouldReachMax = newZoom >= (MAX_ZOOM - ZOOM_EPSILON) && isZoomingIn
      
      // If at max zoom and trying to zoom in, prevent default and stop
      if ((isAtMaxZoom || wouldReachMax) && isZoomingIn) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        return
      }
      
      e.preventDefault()
      e.stopPropagation()
      
      if (imageContainerRef.current) {
        const rect = imageContainerRef.current.getBoundingClientRect()
        const scrollLeft = imageContainerRef.current.scrollLeft
        const scrollTop = imageContainerRef.current.scrollTop
        const mouseX = e.clientX - rect.left + scrollLeft
        const mouseY = e.clientY - rect.top + scrollTop
        
        const zoomChange = newZoom / zoom
        const newScrollLeft = mouseX - (mouseX - scrollLeft) * zoomChange
        const newScrollTop = mouseY - (mouseY - scrollTop) * zoomChange
        
        setZoom(newZoom)
        
        // Update scroll position after zoom
        requestAnimationFrame(() => {
          if (imageContainerRef.current) {
            imageContainerRef.current.scrollLeft = newScrollLeft
            imageContainerRef.current.scrollTop = newScrollTop
          }
        })
      } else {
        setZoom(newZoom)
      }
    }
    // If not Ctrl/Cmd, allow normal scrolling (don't prevent default)
  }
  
  // Update pan state when scroll changes (for display purposes, though we now use scroll directly)
  useEffect(() => {
    if (!imageContainerRef.current) return
    
    const container = imageContainerRef.current
    const handleScroll = () => {
      // Update pan state to track scroll position (for potential future use)
      setPan({
        x: -container.scrollLeft,
        y: -container.scrollTop
      })
    }
    
    container.addEventListener('scroll', handleScroll, { passive: true })
    
    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [])
  
  // Handle mouse drag for panning
  const handleMouseDown = (e) => {
    if (zoom > 1 && e.button === 0) { // Left mouse button
      e.preventDefault()
      setIsDragging(true)
      setDragStart({
        x: e.clientX,
        y: e.clientY
      })
    }
  }
  
  // Global mouse move handler for dragging
  useEffect(() => {
    if (!isDragging) return
    
    const handleMouseMove = (e) => {
      if (isDragging && zoom > 1 && imageContainerRef.current) {
        const container = imageContainerRef.current
        const rect = container.getBoundingClientRect()
        const startScrollLeft = container.scrollLeft
        const startScrollTop = container.scrollTop
        const startX = dragStart.x - rect.left
        const startY = dragStart.y - rect.top
        const currentX = e.clientX - rect.left
        const currentY = e.clientY - rect.top
        
        container.scrollLeft = startScrollLeft - (currentX - startX)
        container.scrollTop = startScrollTop - (currentY - startY)
      }
    }
    
    const handleMouseUp = () => {
      setIsDragging(false)
    }
    
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragStart, zoom])
  
  // Extract content for a specific exhibit
  const extractExhibitContent = async (exhibit) => {
    setIsLoadingContent(true)
    try {
      if (!pdfDoc) {
        setExhibitContent({
          pageImage: null,
          exhibit: exhibit
        })
        return
      }

      // Find which page contains this exhibit based on pageCharOffset
      const exhibitPosition = exhibit.position
      let targetPageNum = 1
      
      if (pageData && pageData.length > 0) {
        // Find the page that contains this character position
        // The exhibit position should be >= pageCharOffset and < next page's pageCharOffset
        for (let i = 0; i < pageData.length; i++) {
          const pageInfo = pageData[i]
          const nextPageInfo = pageData[i + 1]
          
          // Check if exhibit position is within this page's range
          if (exhibitPosition >= pageInfo.pageCharOffset) {
            // If there's no next page, or the position is before the next page starts
            if (!nextPageInfo || exhibitPosition < nextPageInfo.pageCharOffset) {
              targetPageNum = pageInfo.pageNum
              break
            }
          }
        }
        
        // If we didn't find a page (shouldn't happen, but fallback)
        if (targetPageNum === 1 && pageData.length > 0) {
          // Check if it's actually on the last page
          const lastPage = pageData[pageData.length - 1]
          if (exhibitPosition >= lastPage.pageCharOffset) {
            targetPageNum = lastPage.pageNum
          }
        }
      } else {
        // Fallback: estimate page based on text position
        targetPageNum = Math.ceil((exhibitPosition / extractedText.length) * pdfDoc.numPages)
        targetPageNum = Math.max(1, Math.min(targetPageNum, pdfDoc.numPages))
      }
      
      // Render the page where the exhibit appears
      const pageImage = await renderPageAsImage(targetPageNum)
      
      setExhibitContent({
        pageImage: pageImage,
        pageNum: targetPageNum,
        exhibit: exhibit
      })
    } catch (error) {
      console.error('Error extracting exhibit content:', error)
      setExhibitContent({
        pageImage: null,
        exhibit: exhibit
      })
    } finally {
      setIsLoadingContent(false)
    }
  }

  // Render a PDF page as an image
  const renderPageAsImage = async (pageNum) => {
    try {
      if (!pdfDoc) return null
      
      // Get the page (PDF.js uses 0-indexed)
      const page = await pdfDoc.getPage(pageNum - 1)
      
      // Use a higher scale for better readability (zoom in)
      // Scale of 2.0 gives good detail while still being manageable
      const scale = 2.0
      const viewport = page.getViewport({ scale: scale })
      
      // Create canvas and render
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      canvas.width = viewport.width
      canvas.height = viewport.height
      
      // Render the page
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise
      
      // Convert canvas to data URL
      return canvas.toDataURL('image/png')
    } catch (error) {
      console.error('Error rendering page as image:', error)
      return null
    }
  }

  const handleExhibitClick = (exhibit) => {
    setSelectedExhibit(exhibit)
    // Auto-expand when exhibit is clicked
    if (setIsExpanded) {
      setIsExpanded(true)
      // Set sidebar width to 50vw (middle of page) if not already expanded
      if (!isExpanded && setSidebarWidth) {
        const targetWidth = Math.floor(window.innerWidth * 0.5)
        setSidebarWidth(targetWidth)
      }
    }
    if (onExhibitClick) {
      onExhibitClick(exhibit)
    }
  }

  const handleCloseExhibit = () => {
    setSelectedExhibit(null)
    setExhibitContent(null)
    // Collapse back to normal size
    if (setIsExpanded) {
      setIsExpanded(false)
      // Reset to normal sidebar width (230px)
      if (setSidebarWidth) {
        setSidebarWidth(230)
      }
    }
  }

  const handleBackToList = () => {
    setSelectedExhibit(null)
    setExhibitContent(null)
    // Keep expanded state - user can still resize
  }

  const formatExhibitName = (exhibit) => {
    const typeMap = {
      'exhibit': 'Exhibit',
      'anexo': 'Anexo',
      'prueba': 'Prueba',
      'evidencia': 'Evidencia',
      'documento': 'Documento'
    }
    const typeName = typeMap[exhibit.type] || exhibit.type
    return `${typeName} ${exhibit.number}`
  }

  if (isPDFProcessing) {
    return (
      <div className="sidebar-tab-content exhibits-sidebar-content">
        <div className="exhibits-loading">
          <IconLoading size={32} />
          <p>Processing PDF for AI features...</p>
          <p className="exhibits-loading-subtitle">This may take a moment</p>
        </div>
      </div>
    )
  }

  // Show loading state while validating
  if (validatingExhibits || (!validationComplete && rawExhibits.length > 0)) {
    return (
      <div className="sidebar-tab-content exhibits-sidebar-content">
        <div className="feature-placeholder">
          <IconLoading size={48} />
          <h3>Validating Exhibits</h3>
          <p>Analyzing exhibit images to ensure accurate names...</p>
        </div>
      </div>
    )
  }

  if (exhibits.length === 0) {
    return (
      <div className="sidebar-tab-content exhibits-sidebar-content">
        <div className="feature-placeholder">
          <IconFileText size={48} />
          <h3>Exhibits Insights</h3>
          <p>No exhibits found in this document</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`sidebar-tab-content exhibits-sidebar-content ${isExpanded ? 'exhibits-sidebar-expanded' : ''}`}>
      <div className="exhibits-list">
        {!selectedExhibit ? (
          <>
            <div className="exhibits-header">
              <h3>Exhibits</h3>
              <span className="exhibits-count">{exhibits.length} found</span>
            </div>
            
            <div className="exhibits-items">
              {exhibits.map((exhibit, index) => (
                <div
                  key={`${exhibit.type}-${exhibit.number}-${index}`}
                  className={`exhibit-item ${selectedExhibit === exhibit ? 'selected' : ''}`}
                  onClick={() => handleExhibitClick(exhibit)}
                >
                  <div className="exhibit-item-name">
                    {formatExhibitName(exhibit)}
                  </div>
                  <div className="exhibit-item-type">
                    {exhibit.type}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* Exhibit Details View */
          <div className="exhibit-details">
            <div className="exhibit-details-header">
              <button
                className="btn-back-exhibit"
                onClick={handleBackToList}
                title="Back to exhibits list"
              >
                <IconChevronLeft size={16} />
                <span>Back</span>
              </button>
              <h4>{formatExhibitName(selectedExhibit)}</h4>
              <button
                className="btn-close-exhibit"
                onClick={handleCloseExhibit}
                title="Close exhibit view"
              >
                <IconClose size={16} />
              </button>
            </div>
            
            {isLoadingContent ? (
              <div className="exhibit-content-loading">
                <IconLoading size={24} />
                <p>Loading exhibit page...</p>
              </div>
            ) : exhibitContent ? (
              <div className="exhibit-content">
                {exhibitContent.pageImage ? (
                  <div className="exhibit-page-container">
                    {exhibitContent.pageNum && (
                      <div className="exhibit-page-number">
                        Page {exhibitContent.pageNum}
                      </div>
                    )}
                    <div 
                      className="exhibit-page-scroll-container"
                      ref={imageContainerRef}
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onWheel={handleWheel}
                      onMouseDown={handleMouseDown}
                      style={{ 
                        cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                        // Prevent native pinch-zoom when near max zoom to avoid page zoom
                        // Set threshold earlier (4.5) to prevent browser from starting native zoom
                        touchAction: (zoom >= 4.5) ? 'pan-x pan-y' : (zoom > 1 ? 'pan-x pan-y pinch-zoom' : 'pan-x pan-y'),
                        userSelect: 'none',
                        overflow: 'auto' // Always allow scrolling
                      }}
                    >
                      <div
                        className="exhibit-page-image-wrapper"
                        style={{
                          // Don't use transform scale - set actual size for proper scrolling
                          width: imageSize.width > 0 ? `${imageSize.width * zoom}px` : 'auto',
                          height: imageSize.height > 0 ? `${imageSize.height * zoom}px` : 'auto',
                          display: 'inline-block',
                          minWidth: imageSize.width > 0 ? `${imageSize.width * zoom}px` : 'auto',
                          transition: isDragging ? 'none' : 'width 0.1s ease-out, height 0.1s ease-out',
                        }}
                      >
                        <img
                          ref={imageRef}
                          src={exhibitContent.pageImage}
                          alt={`${formatExhibitName(selectedExhibit)} - Page ${exhibitContent.pageNum || ''}`}
                          className="exhibit-page-image"
                          draggable={false}
                          style={{
                            width: imageSize.width > 0 ? `${imageSize.width * zoom}px` : 'auto',
                            height: imageSize.height > 0 ? `${imageSize.height * zoom}px` : 'auto',
                            display: 'block',
                            maxWidth: imageSize.width > 0 ? 'none' : '100%',
                            minWidth: imageSize.width > 0 ? `${imageSize.width * zoom}px` : 'auto',
                          }}
                          onLoad={(e) => {
                            const img = e.target
                            // Get the natural image size (this is the actual rendered size from PDF at scale 2.0)
                            const naturalWidth = img.naturalWidth
                            const naturalHeight = img.naturalHeight
                            
                            // Calculate displayed size based on container
                            // Use multiple requestAnimationFrame calls to ensure container has rendered
                            requestAnimationFrame(() => {
                              requestAnimationFrame(() => {
                                if (imageContainerRef.current) {
                                  const containerWidth = imageContainerRef.current.clientWidth - 16 // Account for padding
                                  // The image is already rendered at 2x scale, so use natural size but fit to container
                                  // Use at least 80% of container width to ensure it's visible
                                  const minDisplayWidth = Math.max(containerWidth * 0.8, 400)
                                  const displayedWidth = Math.max(
                                    Math.min(naturalWidth, containerWidth),
                                    minDisplayWidth
                                  )
                                  const aspectRatio = naturalHeight / naturalWidth
                                  const displayedHeight = displayedWidth * aspectRatio
                                  
                                  setImageSize({
                                    width: displayedWidth,
                                    height: displayedHeight
                                  })
                                } else {
                                  // Fallback: use natural size (it's already at 2x scale)
                                  setImageSize({
                                    width: naturalWidth,
                                    height: naturalHeight
                                  })
                                }
                              })
                            })
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="exhibit-no-content">
                    <p>Unable to render exhibit page.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="exhibit-content-loading">
                <p>Unable to load exhibit content.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ExhibitsSidebar


