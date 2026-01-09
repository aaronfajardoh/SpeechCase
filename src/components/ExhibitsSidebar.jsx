import React, { useState, useEffect, useRef } from 'react'
import { IconFileText, IconLoading, IconClose, IconChevronLeft } from './Icons.jsx'
import { extractExhibits, chunkText, addMetadataTags } from '../../services/chunking.js'
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
  const [chunksWithMetadata, setChunksWithMetadata] = useState([]) // Store chunks with exhibit metadata
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

  // Helper function to map a chunk's startIndex to a page number
  const getPageForChunk = (chunkStartIndex) => {
    if (!pageData || pageData.length === 0) return null
    
    for (let i = 0; i < pageData.length; i++) {
      const pageInfo = pageData[i]
      const nextPageInfo = pageData[i + 1]
      if (chunkStartIndex >= pageInfo.pageCharOffset) {
        if (!nextPageInfo || chunkStartIndex < nextPageInfo.pageCharOffset) {
          return pageInfo.pageNum
        }
      }
    }
    
    // Fallback: check if it's on the last page
    if (pageData.length > 0) {
      const lastPage = pageData[pageData.length - 1]
      if (chunkStartIndex >= lastPage.pageCharOffset) {
        return lastPage.pageNum
      }
    }
    
    return null
  }

  // Helper function to get pages containing a specific exhibit using chunk metadata
  // This is much more efficient than searching the full text
  const getPagesWithExhibits = (specificExhibitName = null) => {
    if (!pageData || !chunksWithMetadata.length) {
      return new Set()
    }
    
    const pagesWithExhibits = new Set()
    
    // If a specific exhibit name is provided, only find pages for that exhibit
    // Otherwise, find pages for all exhibits
    if (specificExhibitName) {
      const exhibitNameLower = specificExhibitName.toLowerCase().trim()
      
      // Extract type and number from the exhibit name for better matching
      // e.g., "Annex 8" -> type: "annex", number: "8"
      const exhibitMatch = exhibitNameLower.match(/^(exhibit|anexo|prueba|evidencia|documento|figure|figura|appendix|annex|attachment|chart|table|tabla|diagram|diagrama|schedule)\s+(.+)$/i)
      const targetType = exhibitMatch ? exhibitMatch[1].toLowerCase() : null
      const targetNumber = exhibitMatch ? exhibitMatch[2].trim() : null
      
      // Find chunks that contain this specific exhibit
      chunksWithMetadata.forEach(chunk => {
        if (chunk.metadata?.exhibits && Array.isArray(chunk.metadata.exhibits)) {
          // Check if any exhibit in this chunk matches the target exhibit
          const hasTargetExhibit = chunk.metadata.exhibits.some(exhibit => {
            const chunkExhibitName = (exhibit.fullText || '').toLowerCase().trim()
            const chunkNumber = (exhibit.number || '').toLowerCase().trim()
            
            // Try exact match first (both normalized to lowercase)
            if (chunkExhibitName === exhibitNameLower) {
              return true
            }
            
            // If we extracted type and number, try matching those
            if (targetType && targetNumber) {
              // Check if chunk exhibit name contains the target type and number
              // The chunk might have "annex 8" and we're looking for "annex 8"
              const hasType = chunkExhibitName.includes(targetType)
              // Match number more flexibly - could be "8", " 8", "8.", etc.
              const normalizeNumber = (num) => num.replace(/[.,;:]/g, '').trim()
              const normalizedChunkNumber = normalizeNumber(chunkNumber)
              const normalizedTargetNumber = normalizeNumber(targetNumber)
              const hasNumber = normalizedChunkNumber === normalizedTargetNumber || 
                               chunkExhibitName.includes(` ${targetNumber}`) || 
                               chunkExhibitName.includes(targetNumber) ||
                               chunkExhibitName.endsWith(targetNumber)
              if (hasType && hasNumber) {
                return true
              }
            }
            
            // Fallback: check if names overlap significantly
            // Remove punctuation and normalize spacing for comparison
            const normalizeForMatch = (str) => str.replace(/[.,;:]/g, '').replace(/\s+/g, ' ').trim()
            const normalizedChunk = normalizeForMatch(chunkExhibitName)
            const normalizedTarget = normalizeForMatch(exhibitNameLower)
            
            return normalizedChunk.includes(normalizedTarget) || 
                   normalizedTarget.includes(normalizedChunk) ||
                   (chunkNumber && chunkNumber === targetNumber && targetType && chunkExhibitName.includes(targetType))
          })
          
          if (hasTargetExhibit) {
            const pageNum = getPageForChunk(chunk.startIndex)
            if (pageNum) {
              pagesWithExhibits.add(pageNum)
            }
          }
        }
      })
    } else {
      // Find pages for all exhibits (for backward compatibility)
      chunksWithMetadata.forEach(chunk => {
        if (chunk.metadata?.exhibits && Array.isArray(chunk.metadata.exhibits) && chunk.metadata.exhibits.length > 0) {
          const pageNum = getPageForChunk(chunk.startIndex)
          if (pageNum) {
            pagesWithExhibits.add(pageNum)
          }
        }
      })
    }
    
    return pagesWithExhibits
  }

  // Create chunks with metadata when text is available
  useEffect(() => {
    if (extractedText && extractedText.length > 0 && !isPDFProcessing) {
      try {
        const chunks = chunkText(extractedText, { chunkSize: 1000, chunkOverlap: 200 })
        const chunksWithTags = addMetadataTags(chunks, extractedText)
        setChunksWithMetadata(chunksWithTags)
      } catch (error) {
        console.error('Error creating chunks:', error)
        setChunksWithMetadata([])
      }
    } else {
      setChunksWithMetadata([])
    }
  }, [extractedText, isPDFProcessing])

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
              // Find which page contains the mention of this exhibit
              const exhibitPosition = exhibit.position
              let mentionPageNum = 1
              
              if (pageData && pageData.length > 0) {
                for (let i = 0; i < pageData.length; i++) {
                  const pageInfo = pageData[i]
                  const nextPageInfo = pageData[i + 1]
                  if (exhibitPosition >= pageInfo.pageCharOffset) {
                    if (!nextPageInfo || exhibitPosition < nextPageInfo.pageCharOffset) {
                      mentionPageNum = pageInfo.pageNum
                      break
                    }
                  }
                }
                
                if (mentionPageNum === 1 && pageData.length > 0) {
                  const lastPage = pageData[pageData.length - 1]
                  if (exhibitPosition >= lastPage.pageCharOffset) {
                    mentionPageNum = lastPage.pageNum
                  }
                }
              } else {
                mentionPageNum = Math.ceil((exhibitPosition / extractedText.length) * pdfDoc.numPages)
                mentionPageNum = Math.max(1, Math.min(mentionPageNum, pdfDoc.numPages))
              }

              // Format the exhibit name to search for
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
              const exhibitName = formatExhibitName(exhibit)
              
              // Simple strategy: Find the LAST occurrence of the exhibit name in the full text
              // The last mention is almost always the actual exhibit page
              let targetPageNum = mentionPageNum
              
              // Search for all occurrences of the exhibit name in the full text
              const exhibitNameLower = exhibitName.toLowerCase()
              const exhibitPattern = new RegExp(`\\b${exhibitNameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
              const allMatches = []
              let match
              exhibitPattern.lastIndex = 0
              
              while ((match = exhibitPattern.exec(extractedText)) !== null) {
                allMatches.push({
                  position: match.index,
                  text: match[0]
                })
              }
              
              // Use the last occurrence to determine the page
              if (allMatches.length > 0) {
                const lastMatch = allMatches[allMatches.length - 1]
                const lastMatchPosition = lastMatch.position
                
                // Find which page contains the last occurrence
                if (pageData && pageData.length > 0) {
                  for (let i = 0; i < pageData.length; i++) {
                    const pageInfo = pageData[i]
                    const nextPageInfo = pageData[i + 1]
                    if (lastMatchPosition >= pageInfo.pageCharOffset) {
                      if (!nextPageInfo || lastMatchPosition < nextPageInfo.pageCharOffset) {
                        targetPageNum = pageInfo.pageNum
                        break
                      }
                    }
                  }
                  
                  // Fallback: check if it's on the last page
                  if (targetPageNum === mentionPageNum && pageData.length > 0) {
                    const lastPage = pageData[pageData.length - 1]
                    if (lastMatchPosition >= lastPage.pageCharOffset) {
                      targetPageNum = lastPage.pageNum
                    }
                  }
                } else {
                  targetPageNum = Math.ceil((lastMatchPosition / extractedText.length) * pdfDoc.numPages)
                  targetPageNum = Math.max(1, Math.min(targetPageNum, pdfDoc.numPages))
                }
              } else {
                // Fallback: if no matches found, use mention page
              }

              // Verify with AI that the selected page actually contains this specific exhibit
              // This is important when multiple exhibits are on the same page
              let verifiedPageNum = targetPageNum
              let pageContainsExhibit = false // Initialize outside try block to avoid scope issues
              try {
                // Validate pdfDoc and page number before proceeding
                if (!pdfDoc) {
                  throw new Error(`PDF document is not loaded yet`)
                }
                
                // Check if pdfDoc is in a valid state (not destroyed)
                if (!pdfDoc.numPages || pdfDoc.numPages <= 0) {
                  throw new Error(`PDF document is in an invalid state (numPages: ${pdfDoc.numPages})`)
                }
                
                if (!targetPageNum || targetPageNum < 1 || targetPageNum > pdfDoc.numPages) {
                  throw new Error(`Invalid page number: ${targetPageNum} (valid range: 1-${pdfDoc.numPages})`)
                }
                
                const verifyPage = await pdfDoc.getPage(targetPageNum - 1)
                const verifyScale = 1.0 // Lower scale for faster verification
                const verifyViewport = verifyPage.getViewport({ scale: verifyScale })
                const verifyCanvas = document.createElement('canvas')
                const verifyContext = verifyCanvas.getContext('2d')
                verifyCanvas.width = verifyViewport.width
                verifyCanvas.height = verifyViewport.height
                
                await verifyPage.render({
                  canvasContext: verifyContext,
                  viewport: verifyViewport
                }).promise
                
                const verifyImageDataUrl = verifyCanvas.toDataURL('image/png')
                const verifyResult = await validateExhibitName(verifyImageDataUrl, exhibitName)
                
                // Check if the found exhibit name contains our specific exhibit
                const foundExhibitName = verifyResult.exhibitName ? verifyResult.exhibitName.toLowerCase() : ''
                const searchExhibitName = exhibitName.toLowerCase()
                const exactNamePattern = new RegExp(`\\b${searchExhibitName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
                const exactMatch = exactNamePattern.test(foundExhibitName)
                
                // Accept if: validated AND (matches OR exact name found in list)
                pageContainsExhibit = verifyResult.validated && (verifyResult.matches || exactMatch)
                
                // If the page doesn't contain this specific exhibit, search forward AND backward
                if (!pageContainsExhibit) {
                  // Get pages that contain THIS SPECIFIC exhibit using chunk metadata
                  // This is much more efficient than searching all exhibit pages
                  const pagesWithExhibits = getPagesWithExhibits(exhibitName)
                  const allPagesArray = Array.from(pagesWithExhibits).sort((a, b) => a - b)
                  
                  // Search BOTH forward and backward from targetPageNum
                  // Prioritize pages close to targetPageNum (within 5 pages)
                  const forwardPages = allPagesArray.filter(pageNum => pageNum > targetPageNum && pageNum <= pdfDoc.numPages)
                  const backwardPages = allPagesArray.filter(pageNum => pageNum < targetPageNum && pageNum >= 1)
                  
                  // Build candidate list: first check backward (exhibit might be before prose mention), then forward
                  // Prioritize pages within 5 pages of targetPageNum
                  let candidatePages = []
                  
                  // Add backward pages (closest first, but limit to 3 pages)
                  const nearbyBackward = backwardPages.filter(p => targetPageNum - p <= 5).slice(-3).reverse()
                  candidatePages.push(...nearbyBackward)
                  
                  // Add forward pages (closest first, limit to 10 pages)
                  candidatePages.push(...forwardPages.slice(0, 10))
                  
                  // FALLBACK: If chunk metadata returned 0 pages, use the old last-occurrence method
                  // This ensures we still find the exhibit even if chunk matching fails
                  if (candidatePages.length === 0 && extractedText) {
                    // Use the old method: find all pages with any exhibits, then filter
                    const allPagesWithExhibits = getPagesWithExhibits() // No specific name = all exhibits
                    const allPagesArray2 = Array.from(allPagesWithExhibits).sort((a, b) => a - b)
                    const forwardPages2 = allPagesArray2.filter(pageNum => pageNum > targetPageNum && pageNum <= pdfDoc.numPages)
                    const backwardPages2 = allPagesArray2.filter(pageNum => pageNum < targetPageNum && pageNum >= 1)
                    candidatePages = []
                    candidatePages.push(...backwardPages2.filter(p => targetPageNum - p <= 5).slice(-3).reverse())
                    candidatePages.push(...forwardPages2.slice(0, 10))
                    
                    // If that also returns 0, fall back to sequential search (last resort)
                    if (candidatePages.length === 0) {
                      // Last resort: sequential search backward first (up to 5 pages), then forward (up to 25 pages)
                      for (let pageNum = Math.max(1, targetPageNum - 5); pageNum < targetPageNum; pageNum++) {
                        candidatePages.push(pageNum)
                      }
                      for (let pageNum = targetPageNum + 1; pageNum <= Math.min(targetPageNum + 25, pdfDoc.numPages); pageNum++) {
                        candidatePages.push(pageNum)
                      }
                    }
                  }
                  
                  // Search up to 10 candidate pages (instead of 25 sequential pages)
                  const maxPagesToTest = Math.min(candidatePages.length, 10)
                  for (let i = 0; i < maxPagesToTest; i++) {
                    const pageNum = candidatePages[i]
                    try {
                      // Validate page number before accessing
                      if (!pdfDoc || !pageNum || pageNum < 1 || pageNum > pdfDoc.numPages) {
                        continue
                      }
                      const testPage = await pdfDoc.getPage(pageNum - 1)
                      const testScale = 1.0
                      const testViewport = testPage.getViewport({ scale: testScale })
                      const testCanvas = document.createElement('canvas')
                      const testContext = testCanvas.getContext('2d')
                      testCanvas.width = testViewport.width
                      testCanvas.height = testViewport.height
                      
                      await testPage.render({
                        canvasContext: testContext,
                        viewport: testViewport
                      }).promise
                      
                      const testImageDataUrl = testCanvas.toDataURL('image/png')
                      const testResult = await validateExhibitName(testImageDataUrl, exhibitName)
                      
                      const testFoundName = testResult.exhibitName ? testResult.exhibitName.toLowerCase() : ''
                      const testExactMatch = exactNamePattern.test(testFoundName)
                      const testPageContainsExhibit = testResult.validated && (testResult.matches || testExactMatch)
                      
                      if (testPageContainsExhibit) {
                        verifiedPageNum = pageNum
                        break
                      }
                    } catch (testError) {
                      console.error(`Error testing page ${pageNum}:`, testError)
                    }
                  }
                }
              } catch (verifyError) {
                console.error('Error verifying page with AI:', verifyError)
                // Continue with the selected page if verification fails
              }
              
              // Use the verified page number
              // Always store verifiedPageNum, even if it's the initial targetPageNum
              // This ensures instant loading on subsequent clicks
              // If verification failed to find the exhibit and we didn't find it in search,
              // we still store targetPageNum (which may be prose) but mark it as unverified
              if (verifiedPageNum === targetPageNum && !pageContainsExhibit) {
                // The initial page didn't contain the exhibit and search didn't find it
                // This means we couldn't verify the page. Don't use the mention page as it's likely prose.
                // We'll still store it but it should be treated as unverified
              }
              
              // Always use verifiedPageNum (which defaults to targetPageNum if search failed)
              // This ensures we have a page number stored for instant loading on click
              targetPageNum = verifiedPageNum || targetPageNum

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
              
              // Use the formatted exhibit name we already created
              const extractedName = exhibitName
              
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
                    originalName: extractedName,
                    verifiedPageNum: verifiedPageNum
                  }
                }
              }
              
              // Return original exhibit (either validated as correct or validation failed)
              // Store the verified page number so we don't need to verify again on click
              // Always store it, even if it's the initial targetPageNum (so clicking is instant)
              // Use targetPageNum as fallback since it's always set
              return {
                ...exhibit,
                validated: validationResult.validated || false,
                verifiedPageNum: verifiedPageNum || targetPageNum // Store even if it's the initial targetPageNum
              }
            } catch (error) {
              console.error(`Error validating exhibit ${exhibit.type} ${exhibit.number}:`, error)
              // Return original exhibit if validation fails
              // Still store targetPageNum so clicking doesn't require re-validation
              return { ...exhibit, validated: false, verifiedPageNum: targetPageNum || null }
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

      // If we already verified the page during validation, use it directly
      // This avoids duplicate AI calls and page renders, significantly reducing latency
      let targetPageNum = exhibit.verifiedPageNum
      
      if (!targetPageNum) {
        // Only do the full verification if we don't have a cached page number
        // This can happen if validation failed or was skipped
        
        // Find the LAST occurrence of the exhibit name to get the actual exhibit page
        // Format the exhibit name
        const formatExhibitName = (ex) => {
          const typeMap = {
            'exhibit': 'Exhibit',
            'anexo': 'Anexo',
            'prueba': 'Prueba',
            'evidencia': 'Evidencia',
            'documento': 'Documento',
            'figure': 'Figure',
            'figura': 'Figura',
            'appendix': 'Appendix',
            'annex': 'Annex',
            'attachment': 'Attachment',
            'chart': 'Chart',
            'table': 'Table',
            'tabla': 'Tabla',
            'diagram': 'Diagram',
            'diagrama': 'Diagrama',
            'schedule': 'Schedule'
          }
          const typeName = typeMap[ex.type] || ex.type
          return `${typeName} ${ex.number}`
        }
        const exhibitName = formatExhibitName(exhibit)
        
        // Find all occurrences of the exhibit name in the full text
        const exhibitNameLower = exhibitName.toLowerCase()
        const exhibitPattern = new RegExp(`\\b${exhibitNameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
        const allMatches = []
        let match
        exhibitPattern.lastIndex = 0
        
        while ((match = exhibitPattern.exec(extractedText)) !== null) {
          allMatches.push({
            position: match.index,
            text: match[0]
          })
        }
        
        // Use the last occurrence to determine the page
        targetPageNum = 1
        if (allMatches.length > 0) {
          const lastMatch = allMatches[allMatches.length - 1]
          const lastMatchPosition = lastMatch.position
          
          // Find which page contains the last occurrence
          if (pageData && pageData.length > 0) {
            for (let i = 0; i < pageData.length; i++) {
              const pageInfo = pageData[i]
              const nextPageInfo = pageData[i + 1]
              if (lastMatchPosition >= pageInfo.pageCharOffset) {
                if (!nextPageInfo || lastMatchPosition < nextPageInfo.pageCharOffset) {
                  targetPageNum = pageInfo.pageNum
                  break
                }
              }
            }
            
            // Fallback: check if it's on the last page
            if (targetPageNum === 1 && pageData.length > 0) {
              const lastPage = pageData[pageData.length - 1]
              if (lastMatchPosition >= lastPage.pageCharOffset) {
                targetPageNum = lastPage.pageNum
              }
            }
          } else {
            // Fallback: estimate page based on text position
            targetPageNum = Math.ceil((lastMatchPosition / extractedText.length) * pdfDoc.numPages)
            targetPageNum = Math.max(1, Math.min(targetPageNum, pdfDoc.numPages))
          }
        } else {
          // Fallback: use the original position if no matches found
          const exhibitPosition = exhibit.position
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
          } else {
            targetPageNum = Math.ceil((exhibitPosition / extractedText.length) * pdfDoc.numPages)
            targetPageNum = Math.max(1, Math.min(targetPageNum, pdfDoc.numPages))
          }
        }
        
        // Verify with AI that the selected page actually contains this specific exhibit
        let verifiedPageNum = targetPageNum
        try {
          const verifyPage = await pdfDoc.getPage(targetPageNum - 1)
          const verifyScale = 1.0
          const verifyViewport = verifyPage.getViewport({ scale: verifyScale })
          const verifyCanvas = document.createElement('canvas')
          const verifyContext = verifyCanvas.getContext('2d')
          verifyCanvas.width = verifyViewport.width
          verifyCanvas.height = verifyViewport.height
          
          await verifyPage.render({
            canvasContext: verifyContext,
            viewport: verifyViewport
          }).promise
          
          const verifyImageDataUrl = verifyCanvas.toDataURL('image/png')
          const verifyResult = await validateExhibitName(verifyImageDataUrl, exhibitName)
          
          const foundExhibitName = verifyResult.exhibitName ? verifyResult.exhibitName.toLowerCase() : ''
          const searchExhibitName = exhibitName.toLowerCase()
          const exactNamePattern = new RegExp(`\\b${searchExhibitName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
          const exactMatch = exactNamePattern.test(foundExhibitName)
          const pageContainsExhibit = verifyResult.validated && (verifyResult.matches || exactMatch)
          
        // If the page doesn't contain this specific exhibit, search forward AND backward
        if (!pageContainsExhibit) {
          // Get pages that contain THIS SPECIFIC exhibit using chunk metadata
          // This is much more efficient than searching all exhibit pages
          const pagesWithExhibits = getPagesWithExhibits(exhibitName)
          const allPagesArray = Array.from(pagesWithExhibits).sort((a, b) => a - b)
          
          // Search BOTH forward and backward from targetPageNum
          // Prioritize pages close to targetPageNum (within 5 pages)
          const forwardPages = allPagesArray.filter(pageNum => pageNum > targetPageNum && pageNum <= pdfDoc.numPages)
          const backwardPages = allPagesArray.filter(pageNum => pageNum < targetPageNum && pageNum >= 1)
          
          // Build candidate list: first check backward (exhibit might be before prose mention), then forward
          // Prioritize pages within 5 pages of targetPageNum
          let candidatePages = []
          
          // Add backward pages (closest first, but limit to 3 pages)
          const nearbyBackward = backwardPages.filter(p => targetPageNum - p <= 5).slice(-3).reverse()
          candidatePages.push(...nearbyBackward)
          
          // Add forward pages (closest first, limit to 10 pages)
          candidatePages.push(...forwardPages.slice(0, 10))
          
          // FALLBACK: If chunk metadata returned 0 pages, use the old last-occurrence method
          // This ensures we still find the exhibit even if chunk matching fails
          if (candidatePages.length === 0 && extractedText) {
            // Use the old method: find all pages with any exhibits, then filter
            const allPagesWithExhibits = getPagesWithExhibits() // No specific name = all exhibits
            const allPagesArray2 = Array.from(allPagesWithExhibits).sort((a, b) => a - b)
            const forwardPages2 = allPagesArray2.filter(pageNum => pageNum > targetPageNum && pageNum <= pdfDoc.numPages)
            const backwardPages2 = allPagesArray2.filter(pageNum => pageNum < targetPageNum && pageNum >= 1)
            candidatePages = []
            candidatePages.push(...backwardPages2.filter(p => targetPageNum - p <= 5).slice(-3).reverse())
            candidatePages.push(...forwardPages2.slice(0, 10))
            
            // If that also returns 0, fall back to sequential search (last resort)
            if (candidatePages.length === 0) {
              // Last resort: sequential search backward first (up to 5 pages), then forward (up to 25 pages)
              for (let pageNum = Math.max(1, targetPageNum - 5); pageNum < targetPageNum; pageNum++) {
                candidatePages.push(pageNum)
              }
              for (let pageNum = targetPageNum + 1; pageNum <= Math.min(targetPageNum + 25, pdfDoc.numPages); pageNum++) {
                candidatePages.push(pageNum)
              }
            }
          }
          
          // Search up to 10 candidate pages (instead of 25 sequential pages)
          for (let i = 0; i < Math.min(candidatePages.length, 10); i++) {
            const pageNum = candidatePages[i]
              try {
                const testPage = await pdfDoc.getPage(pageNum - 1)
                const testScale = 1.0
                const testViewport = testPage.getViewport({ scale: testScale })
                const testCanvas = document.createElement('canvas')
                const testContext = testCanvas.getContext('2d')
                testCanvas.width = testViewport.width
                testCanvas.height = testViewport.height
                
                await testPage.render({
                  canvasContext: testContext,
                  viewport: testViewport
                }).promise
                
                const testImageDataUrl = testCanvas.toDataURL('image/png')
                const testResult = await validateExhibitName(testImageDataUrl, exhibitName)
                
                const testFoundName = testResult.exhibitName ? testResult.exhibitName.toLowerCase() : ''
                const testExactMatch = exactNamePattern.test(testFoundName)
                const testPageContainsExhibit = testResult.validated && (testResult.matches || testExactMatch)
                
                if (testPageContainsExhibit) {
                  verifiedPageNum = pageNum
                  break
                }
              } catch (testError) {
                console.error(`Error testing page ${pageNum}:`, testError)
              }
            }
          }
        } catch (verifyError) {
          console.error('Error verifying display page with AI:', verifyError)
        }
        
        // Use the verified page number
        targetPageNum = verifiedPageNum
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


