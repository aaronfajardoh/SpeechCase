/**
 * Tests for header detection module
 * Tests header detection with examples in English and Spanish
 */

import { detectHeader, detectHeadersInText } from '../services/headerDetection.js';

// Test helper function
function testCase(name, text, followingText, expectedIsHeader, minConfidence = 0.4) {
  const result = detectHeader(text, followingText);
  const passed = result.isHeader === expectedIsHeader && result.confidence >= minConfidence;
  
  console.log(`${passed ? '✓' : '✗'} ${name}`);
  console.log(`  Text: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);
  console.log(`  Expected: ${expectedIsHeader}, Got: ${result.isHeader}, Confidence: ${result.confidence.toFixed(2)}`);
  if (!passed) {
    console.log(`  Signals:`, result.signals);
  }
  console.log('');
  
  return passed;
}

console.log('=== Header Detection Tests ===\n');

let passed = 0;
let total = 0;

// ============================================================================
// TRUE HEADERS - Should be detected as headers
// ============================================================================

console.log('--- TRUE HEADERS ---\n');

// Test 1: Simple title case header
total++;
if (testCase(
  'Title case header: "Drivers of Value Capture"',
  'Drivers of Value Capture',
  'To be profitable, companies must understand...',
  true
)) passed++;

// Test 2: Header with colon
total++;
if (testCase(
  'Header with colon: "Part I: Introduction"',
  'Part I: Introduction',
  'This section covers...',
  true
)) passed++;

// Test 3: Short header
total++;
if (testCase(
  'Short header: "Executive Summary"',
  'Executive Summary',
  'The following analysis...',
  true
)) passed++;

// Test 4: Spanish header
total++;
if (testCase(
  'Spanish header: "Análisis de Mercado"',
  'Análisis de Mercado',
  'El mercado actual muestra...',
  true
)) passed++;

// Test 5: Header with functional words
total++;
if (testCase(
  'Header with functional words: "The Future of Technology"',
  'The Future of Technology',
  'Technology continues to evolve...',
  true
)) passed++;

// Test 6: Single word header (should be less confident but still detected)
total++;
if (testCase(
  'Single word header: "Conclusion"',
  'Conclusion',
  'In summary, we have...',
  true,
  0.2 // Lower threshold for single word
)) passed++;

// Test 7: Header with numbers
total++;
if (testCase(
  'Header with numbers: "Chapter 3: Results"',
  'Chapter 3: Results',
  'The experimental results show...',
  true
)) passed++;

// Test 8: Spanish header with functional words
total++;
if (testCase(
  'Spanish header with functional words: "El Impacto de la Tecnología"',
  'El Impacto de la Tecnología',
  'La tecnología ha transformado...',
  true
)) passed++;

// ============================================================================
// FALSE POSITIVES - Should NOT be detected as headers
// ============================================================================

console.log('--- FALSE POSITIVES (Should NOT be headers) ---\n');

// Test 9: Regular sentence
total++;
if (testCase(
  'Regular sentence: "The company was founded in 1995."',
  'The company was founded in 1995.',
  'It started as a small startup.',
  false
)) passed++;

// Test 10: Question
total++;
if (testCase(
  'Question: "What is the main objective?"',
  'What is the main objective?',
  'The main objective is to...',
  false
)) passed++;

// Test 11: Long paragraph
total++;
if (testCase(
  'Long paragraph (should not be header)',
  'This is a very long paragraph that contains many sentences and should definitely not be detected as a header because it is too long and contains multiple complete thoughts and ideas that span across several sentences.',
  'The next paragraph continues...',
  false
)) passed++;

// Test 12: Sentence with verb
total++;
if (testCase(
  'Sentence with verb: "We analyzed the data"',
  'We analyzed the data and found interesting patterns.',
  'The patterns suggest...',
  false
)) passed++;

// Test 13: Spanish sentence
total++;
if (testCase(
  'Spanish sentence: "La empresa fue fundada en 1995."',
  'La empresa fue fundada en 1995.',
  'Comenzó como una pequeña startup.',
  false
)) passed++;

// Test 14: Sentence ending with period
total++;
if (testCase(
  'Sentence ending with period: "Introduction to the topic."',
  'Introduction to the topic.',
  'This section covers...',
  false
)) passed++;

// Test 15: Very long title-like text
total++;
if (testCase(
  'Very long title-like text (should not be header)',
  'A Comprehensive Analysis of Market Trends and Consumer Behavior Patterns in the Digital Age',
  'The analysis reveals...',
  false
)) passed++;

// ============================================================================
// EDGE CASES
// ============================================================================

console.log('--- EDGE CASES ---\n');

// Test 16: Empty text
total++;
const emptyResult = detectHeader('');
if (emptyResult.isHeader === false) {
  console.log('✓ Empty text handled correctly');
  passed++;
} else {
  console.log('✗ Empty text should return false');
}
console.log('');

// Test 17: Header with punctuation in middle
total++;
if (testCase(
  'Header with punctuation: "Part I: The Beginning"',
  'Part I: The Beginning',
  'This marks the start...',
  true
)) passed++;

// Test 18: Header followed by lowercase (should still be header)
total++;
if (testCase(
  'Header followed by lowercase',
  'Market Analysis',
  'the market shows...',
  true,
  0.3 // Slightly lower threshold since following text doesn't start with capital
)) passed++;

// Test 19: Mixed case (not all caps, not all title case)
total++;
if (testCase(
  'Mixed case: "iPhone and Android"',
  'iPhone and Android',
  'Both platforms offer...',
  true,
  0.3
)) passed++;

// Test 20: Header with numbers and colon
total++;
if (testCase(
  'Header with numbers: "Section 2.1: Methodology"',
  'Section 2.1: Methodology',
  'The methodology used...',
  true
)) passed++;

// ============================================================================
// DETECT HEADERS IN TEXT
// ============================================================================

console.log('--- DETECT HEADERS IN TEXT ---\n');

// Test 21: Multiple headers in text
total++;
const multiHeaderText = `Introduction
This is the introduction paragraph.

Methodology
We used the following methodology.

Results
The results show significant findings.

Conclusion
In conclusion, we have demonstrated...`;

const headers = detectHeadersInText(multiHeaderText);
const headerCount = headers.filter(h => h.isHeader).length;

if (headerCount >= 3) {
  console.log(`✓ Detected ${headerCount} headers in multi-header text`);
  passed++;
} else {
  console.log(`✗ Expected at least 3 headers, got ${headerCount}`);
}
console.log('');

// Test 22: No headers in text
total++;
const noHeaderText = `This is a regular paragraph. It contains multiple sentences. 
The sentences flow naturally. There are no headers here.
Another paragraph follows. It also has regular sentences.`;

const noHeaders = detectHeadersInText(noHeaderText);
const falseHeaderCount = noHeaders.filter(h => h.isHeader).length;

if (falseHeaderCount === 0) {
  console.log('✓ Correctly identified no headers in regular text');
  passed++;
} else {
  console.log(`✗ Expected 0 headers, got ${falseHeaderCount}`);
}
console.log('');

// ============================================================================
// SUMMARY
// ============================================================================

console.log('=== Test Summary ===');
console.log(`Passed: ${passed}/${total}`);
console.log(`Success rate: ${((passed / total) * 100).toFixed(1)}%`);

if (passed === total) {
  console.log('\n✓ All tests passed!');
  process.exit(0);
} else {
  console.log(`\n✗ ${total - passed} test(s) failed`);
  process.exit(1);
}

