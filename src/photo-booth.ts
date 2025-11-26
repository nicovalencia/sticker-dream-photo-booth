// Photo Booth Client
// Captures photos from webcam, sends to backend for coloring page generation

// DOM Elements
const videoElement = document.getElementById("cameraFeed") as HTMLVideoElement;
const canvasElement = document.getElementById("cameraCanvas") as HTMLCanvasElement;
const generatedImage = document.getElementById("generatedImage") as HTMLImageElement;
const captureButton = document.getElementById("captureButton") as HTMLButtonElement;
const retryButton = document.getElementById("retryButton") as HTMLButtonElement;
const statusMessage = document.getElementById("statusMessage") as HTMLDivElement;
const loadingOverlay = document.getElementById("loadingOverlay") as HTMLDivElement;
const sceneInput = document.getElementById("sceneInput") as HTMLInputElement;
const printerToggle = document.getElementById("printerToggle") as HTMLInputElement;

let videoStream: MediaStream | null = null;
let canvasContext: CanvasRenderingContext2D | null = null;

// Initialize camera on page load
async function initializeCamera() {
  try {
    showStatus("Requesting camera access...");

    // Request camera access with 9:16 aspect ratio (portrait)
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user", // Front camera (selfie mode)
        width: { ideal: 720 },
        height: { ideal: 1280 },
        aspectRatio: { ideal: 9/16 }, // Force 9:16 portrait aspect ratio
      },
    });

    // Attach stream to video element
    videoElement.srcObject = videoStream;

    // Wait for video to be ready
    await new Promise<void>((resolve) => {
      videoElement.onloadedmetadata = () => {
        resolve();
      };
    });

    // Show capture button once camera is ready
    hideStatus();
    captureButton.classList.remove("hidden");

    console.log("Camera initialized successfully");
  } catch (error) {
    console.error("Camera initialization failed:", error);

    // Handle different error types
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError") {
        showStatus("Camera access denied. Please enable camera permissions in your browser settings.");
      } else if (error.name === "NotFoundError") {
        showStatus("No camera found. Please connect a camera and refresh the page.");
      } else {
        showStatus(`Camera error: ${error.message}`);
      }
    } else {
      showStatus("Failed to initialize camera. Please refresh the page.");
    }
  }
}

// Capture photo from video feed
function capturePhoto() {
  try {
    // Validate video is ready
    if (!videoElement.videoWidth || !videoElement.videoHeight) {
      throw new Error("Camera feed is not ready. Please wait and try again.");
    }

    if (videoElement.paused || videoElement.ended) {
      throw new Error("Camera feed has stopped. Please refresh the page.");
    }

    // Hide capture button
    captureButton.classList.add("hidden");

    // Set canvas dimensions to match video
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    // Validate canvas dimensions
    if (canvasElement.width === 0 || canvasElement.height === 0) {
      throw new Error("Invalid camera dimensions. Please try again.");
    }

    // Get canvas context
    canvasContext = canvasElement.getContext("2d");
    if (!canvasContext) {
      throw new Error("Failed to get canvas context");
    }

    // Draw current video frame to canvas
    canvasContext.drawImage(videoElement, 0, 0);

    // Hide video, show canvas
    videoElement.style.display = "none";
    canvasElement.style.display = "block";

    // Start grayscale animation after a brief delay
    setTimeout(() => {
      canvasElement.classList.add("grayscale");
    }, 100);

    // Wait for animation to complete, then send to backend
    setTimeout(() => {
      sendPhotoToBackend();
    }, 2200); // 2s animation + 200ms buffer
  } catch (error) {
    console.error("Failed to capture photo:", error);

    let errorMessage = "Failed to capture photo";
    if (error instanceof Error) {
      errorMessage += `: ${error.message}`;
    }

    showStatus(errorMessage);
    resetToCamera();
  }
}

// Convert canvas to blob and send to backend
async function sendPhotoToBackend() {
  try {
    showLoading();

    // Convert canvas to blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvasElement.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to convert canvas to blob"));
          }
        },
        "image/png",
        0.95
      );
    });

    // Create FormData with the image, scene, and printer setting
    const formData = new FormData();
    formData.append("image", blob, "photo.png");
    formData.append("scene", sceneInput.value.trim() || "dancing on a disco floor with disco ball and dance floor tiles");
    formData.append("enablePrinter", printerToggle.checked.toString());

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    try {
      // Send to backend with timeout
      const response = await fetch("/api/generate-from-photo", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `Server error: ${response.status} ${response.statusText}`;

        try {
          const errorText = await response.text();
          if (errorText) {
            errorMessage += ` - ${errorText}`;
          }
        } catch {
          // Ignore error text parsing errors
        }

        throw new Error(errorMessage);
      }

      // Validate response is an image
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.startsWith("image/")) {
        throw new Error("Server did not return an image. Please try again.");
      }

      // Get generated image blob
      const generatedBlob = await response.blob();

      // Validate blob size
      if (generatedBlob.size === 0) {
        throw new Error("Generated image is empty");
      }

      const imageUrl = URL.createObjectURL(generatedBlob);

      // Display generated image
      hideLoading();
      canvasElement.style.display = "none";
      generatedImage.src = imageUrl;
      generatedImage.classList.add("visible");
      retryButton.classList.remove("hidden");

      console.log("Image generated successfully!");
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Request timed out. The server took too long to respond. Please try again.");
      }

      throw error;
    }
  } catch (error) {
    console.error("Failed to generate image:", error);
    hideLoading();

    let errorMessage = "Failed to generate sticker";

    if (error instanceof Error) {
      errorMessage += `: ${error.message}`;
    } else {
      errorMessage += ". Unknown error occurred.";
    }

    showStatus(errorMessage);

    // Show retry button
    retryButton.classList.remove("hidden");
  }
}

// Reset to camera view
function resetToCamera() {
  // Hide generated image
  generatedImage.classList.remove("visible");
  generatedImage.src = "";

  // Hide canvas
  canvasElement.style.display = "none";
  canvasElement.classList.remove("grayscale");

  // Show video
  videoElement.style.display = "block";

  // Hide retry button, show capture button
  retryButton.classList.add("hidden");
  captureButton.classList.remove("hidden");

  // Hide status
  hideStatus();
}

// UI Helper Functions
function showStatus(message: string) {
  statusMessage.textContent = message;
  statusMessage.classList.remove("hidden");
}

function hideStatus() {
  statusMessage.classList.add("hidden");
}

function showLoading() {
  loadingOverlay.classList.add("active");
}

function hideLoading() {
  loadingOverlay.classList.remove("active");
}

// Event Listeners
captureButton.addEventListener("click", capturePhoto);
retryButton.addEventListener("click", resetToCamera);

// Prevent context menu on buttons
captureButton.addEventListener("contextmenu", (e) => e.preventDefault());
retryButton.addEventListener("contextmenu", (e) => e.preventDefault());

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
  }
});

// Initialize camera when page loads
initializeCamera();
