# Photo Booth Implementation Plan

## Overview
Add a new `/photo-booth` page that uses webcam capture instead of voice recording to generate sticker images. Users will tap a button to capture a photo, which will be sent to Gemini for image-to-image generation of a black and white coloring page sticker.

## Research Findings

### Available Gemini Models

Based on the latest Gemini documentation (January 2025), here are the relevant models:

**For Image Understanding (Input Processing):**
- **Gemini 3 Pro** - Most advanced multimodal model, accepts text, image, video, audio, PDF
  - 1M token context window, 64K output tokens
  - Best in class for multimodal understanding
  - Supports granular media resolution control (low: 280 tokens, medium: 560 tokens, high: 1120 tokens per image)
  - Knowledge cutoff: January 2025

- **Gemini 2.5 Flash** - Best price-performance multimodal model
  - Also accepts text, images, video, audio
  - Faster and more cost-effective than 3 Pro

**For Image Generation (Output):**
- **Gemini 3 Pro Image Preview (Nano Banana Pro)** - Studio-quality image generation
  - Built on Gemini 3 Pro
  - Supports text-and-image-to-image generation
  - Can accept up to 14 reference images for composition and style transfer
  - Outputs high-resolution images (1K, 2K, 4K)
  - Advanced text rendering capabilities
  - Integration with Google Search for real-time data

- **Gemini 2.5 Flash Image** - Fast, efficient image generation
  - Good for rapid prototyping
  - Strong photorealistic capabilities

- **Imagen 4.0** (currently in use) - Text-to-image generation
  - Does NOT support image input
  - Only text prompts

### Implementation Approach

**Using Gemini 3 Pro Image (Nano Banana Pro) for Direct Image-to-Image Generation**

We will use Gemini 3 Pro Image Preview's text-and-image-to-image capability to directly convert webcam photos into coloring pages:

- **Single API Call**: Send captured photo + text prompt in one request
- **Multimodal Generation**: Model understands the photo and generates appropriate coloring page
- **Best Quality**: Direct image reference produces better results than description-based generation
- **Efficient**: No intermediate steps, faster processing
- **Prompt Template**: "Convert this photo into a black and white coloring page suitable for kids. Maintain the main subject and composition but simplify details into clear outlines perfect for coloring."

This approach leverages the model's ability to accept up to 14 reference images and perform style transfer, making it ideal for our use case.

## Implementation Steps

### 1. Frontend - Photo Booth Page

**Files to Create:**
- `src/photo-booth.ts` - Client-side logic for webcam capture
- `photo-booth.html` - Photo booth UI page

**Key Features:**
- Initialize webcam using `navigator.mediaDevices.getUserMedia({ video: true })`
- Display live video feed in `<video>` element
- Single tap button to capture frame from video stream
- Use Canvas API to capture current video frame as image blob
- On capture:
  1. Freeze the video frame by hiding video and showing canvas with captured frame
  2. Apply CSS animation to transition canvas from color to grayscale
  3. Send image blob to backend (FormData or base64)
- Display generated coloring page image when received
- Show loading states during processing

**UI Components:**
- Live video preview (fullscreen or large display)
- Canvas overlay for frozen captured frame
- Capture button (single tap, no hold required)
- CSS grayscale animation (color → grayscale transition ~1-2 seconds)
- Loading/processing indicator ("Generating your sticker...")
- Generated image display (shows final coloring page)
- Retry/capture again button

### 2. Backend - API Endpoint

**Files to Modify:**
- `src/server.ts` - Add new `/api/generate-from-photo` endpoint

**New Endpoint Specifications:**
- Route: `POST /api/generate-from-photo`
- Input: FormData with image file OR JSON with base64 image
- Process:
  1. Receive uploaded photo from client
  2. Convert to format suitable for Gemini API
  3. Call Gemini 3 Pro Image with photo + prompt
  4. Generate black and white coloring page
  5. Print to USB printer (using existing `printToUSB()` function)
  6. Return generated image buffer to client

**Gemini Integration:**
- Model: `gemini-3-pro-image-preview` (or latest available variant)
- Prompt template: "Convert this photo into a black and white coloring page suitable for kids. Maintain the main subject and composition but simplify details into clear outlines perfect for coloring."
- Config: 1 image, 9:16 aspect ratio (match current printer settings)
- Reference image: Uploaded photo from webcam

### 3. Model Integration Research

**Need to Determine:**
- Exact model identifier for Gemini 3 Pro Image in `@google/genai` package
- Whether current SDK version supports image-to-image generation
- API parameters for image input (format, encoding, resolution settings)
- Cost implications vs current Imagen 4.0 usage

**Action Items:**
- Check `@google/genai` package documentation for model names
- Test if SDK needs updating for Gemini 3 Pro Image support
- Verify image upload format (base64, file path, Buffer, etc.)
- Test media_resolution parameter options

### 4. Routing

**Files to Modify:**
- `index.html` - Add navigation link to photo booth page (optional)
- `vite.config.ts` - May need multi-page configuration

**Options:**
- Simple approach: Separate HTML file at `/photo-booth.html`
- Router approach: Add client-side routing (would require additional library)
- Recommended: Keep it simple with separate HTML file accessible at `/photo-booth.html`

### 5. Testing & Refinement

**Test Cases:**
- Verify webcam permissions request
- Test on mobile devices (iOS Safari, Android Chrome)
- Verify HTTPS requirement for camera access
- Test image quality at different resolutions
- Verify printer integration works with generated images
- Test error handling (no camera, API failures, printer issues)

**Quality Checks:**
- Generated coloring pages should maintain subject recognition
- Output should be true black and white (not grayscale)
- Line quality should be suitable for coloring
- Printer output should be clear and not too dark/light

### 6. Environment Configuration

**No Changes Required:**
- Current `GEMINI_API_KEY` should work for new Gemini models
- Printing configuration remains the same
- Development setup unchanged

## Technical Considerations

### Browser Compatibility
- Camera API requires HTTPS in production
- Safari may have different permission flows than Chrome
- Mobile browsers may need special handling for camera orientation

### Image Processing
- May need to resize/compress images before sending to API (to control costs)
- Consider adding image preprocessing (crop, rotate, adjust brightness)
- Optimal resolution to balance quality vs token usage

### User Experience
- **Capture Feedback**: Freeze frame with grayscale animation provides immediate visual confirmation
- **No Preview Step**: Maintains surprise element while still showing what was captured
- **CSS Animation**: Use `filter: grayscale()` transition from 0% to 100% over 1-2 seconds
- **Animation Timing**: Start grayscale animation immediately, send API request in parallel
- Error messages for common issues (no camera, permission denied)
- Clear feedback during multi-second generation process ("Generating your sticker...")

### Performance
- Gemini 3 Pro Image may be slower than Imagen 4.0
- Consider adding timeout handling
- May want to implement request queuing if multiple users

### Cost Optimization
- Use media_resolution_low (280 tokens) vs high (1120 tokens) for image input
- Consider caching common generation patterns
- Monitor API usage and costs

## Design Decisions

1. **Mode Coexistence**: Keep both voice-to-sticker and photo-to-sticker modes as separate pages
   - Voice mode at `/` (existing)
   - Photo booth mode at `/photo-booth.html` (new)

2. **Capture Flow**: Instant capture with frozen frame animation, no preview
   - On capture: Freeze the video frame that was captured
   - Animate the frozen frame from color to grayscale using CSS
   - No preview/approval step - maintain surprise element for final sticker
   - Grayscale animation provides visual feedback and hints at transformation
   - Keeps workflow fast and fun while showing user what was captured

3. **Aspect Ratio**: Let camera use native aspect ratio, allow AI to adapt
   - Most phones default to 4:3 or 16:9
   - Gemini 3 Pro Image will handle composition for 9:16 output
   - Simpler than forcing specific camera constraints

4. **Image Preprocessing**: None in MVP
   - Keep implementation simple initially
   - Can add filters/adjustments later if needed
   - Trust Gemini 3 Pro Image's capabilities

5. **Gallery/History**: Out of scope for MVP
   - Focus on core capture → generate → print flow
   - Could add in future iterations

## Implementation Priority

1. **Phase 1 - Core Functionality**
   - Create basic photo-booth.html page
   - Implement webcam capture in photo-booth.ts
   - Add backend endpoint with Gemini 3 Pro Image integration
   - Test end-to-end flow

2. **Phase 2 - Polish**
   - Add loading states and error handling
   - Improve UI/UX
   - Mobile optimization
   - Test on actual hardware printer

3. **Phase 3 - Optional Enhancements**
   - Navigation between modes
   - Image preprocessing options
   - Gallery/history
   - Analytics

## Next Steps

### Immediate Actions (Research & Setup)
1. Research exact Gemini 3 Pro Image model identifier in `@google/genai` package documentation
2. Check if current `@google/genai` version supports image input for generation
3. Determine API format for image input (Buffer, base64, file path, etc.)
4. Test media_resolution parameter options for cost optimization

### Development Sequence
1. **Backend First**: Create `/api/generate-from-photo` endpoint with Gemini 3 Pro Image integration
2. **Test with Sample**: Use a test image file to verify image-to-image generation works
3. **Frontend Webcam**: Build photo-booth.html with camera capture
4. **Integration**: Connect frontend capture to backend endpoint
5. **End-to-End Testing**: Test full flow from capture → generate → print
6. **Polish**: Add error handling, loading states, mobile optimization

## References

- [Gemini Image Generation Docs](https://ai.google.dev/gemini-api/docs/image-generation#javascript)
- [Gemini 3 Pro Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3)
- [Gemini Models Overview](https://ai.google.dev/gemini-api/docs/models)
- [Gemini 3 Pro Image Developer Blog](https://blog.google/technology/developers/gemini-3-pro-image-developers/)
