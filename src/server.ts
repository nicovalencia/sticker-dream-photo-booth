import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { GoogleGenAI } from "@google/genai";
import { printToUSB, watchAndResumePrinters } from './print.ts';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new Hono();
const PORT = 3000;

// Enable CORS for Vite dev server
app.use('/*', cors());

watchAndResumePrinters();

// Initialize Google AI
const ai = new GoogleGenAI({
  apiKey: process.env["GEMINI_API_KEY"],
});

/**
 * Generate an image using Imagen AI
 */

const imageGen4 = "imagen-4.0-generate-001";
const imageGen3 = "imagen-3.0-generate-002";
const imageGen4Fast = "imagen-4.0-fast-generate-001";
const imageGen4Ultra = "imagen-4.0-ultra-generate-001";

async function generateImage(prompt: string): Promise<Buffer | null> {
  console.log(`🎨 Generating image: "${prompt}"`);
  console.time('generation');

  const response = await ai.models.generateImages({
    model: imageGen4,
    prompt: `A black and white kids coloring page.
    <image-description>
    ${prompt}
    </image-description>
    ${prompt}`,
    config: {
      numberOfImages: 1,
      aspectRatio: "9:16"
    },
  });

  console.timeEnd('generation');

  if (!response.generatedImages || response.generatedImages.length === 0) {
    console.error('No images generated');
    return null;
  }

  const imgBytes = response.generatedImages[0].image?.imageBytes;
  if (!imgBytes) {
    console.error('No image bytes returned');
    return null;
  }

  return Buffer.from(imgBytes, "base64");
}

/**
 * Convert a photo to a coloring page using Gemini 3 Pro Image Preview
 */
async function convertPhotoToColoringPage(imageBase64: string, mimeType: string, scene: string): Promise<Buffer | null> {
  console.log(`📸 Converting photo to coloring page with scene: "${scene}"`);
  console.time('photo-conversion');

  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: imageBase64
            }
          },
          {
            text: `Analyze each person in this photo and identify their unique characteristics (hair color/style, clothing, accessories, skin tone, notable features), their facial expressions (happy, sad, surprised, silly, serious, etc.), and their body positions/posture/poses. Then create a black and white coloring page showing these people as adorable chibi characters ${scene}. Each chibi character should have HUGE heads (1/2 to 1/3 of total height), tiny bodies, gigantic sparkling eyes, and maintain the unique characteristics you identified from each person. CRITICALLY IMPORTANT: preserve and carry over their facial expressions and body poses from the original photo to their chibi versions - if someone is smiling broadly, their chibi should smile broadly; if someone has their arms raised or is in a specific pose, their chibi should imitate that pose. Use bold, clean outlines perfect for coloring. Make it extremely cute and stylized in Japanese chibi/SD art style - NOT realistic at all.`
          }
        ]
      }
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: "2:3"  // Match 4x6" printer (4" wide x 6" tall)
      }
    }
  });

  console.timeEnd('photo-conversion');

  if (!response.candidates || response.candidates.length === 0) {
    console.error('No candidates returned from Gemini');
    return null;
  }

  const content = response.candidates[0].content;
  if (!content || !content.parts) {
    console.error('No content or parts in response');
    return null;
  }

  const parts = content.parts;
  const imagePart = parts.find((part: any) => part.inlineData);

  if (!imagePart?.inlineData?.data) {
    console.error('No image data in response');
    return null;
  }

  return Buffer.from(imagePart.inlineData.data, "base64");
}

/**
 * Overlay the background frame on top of a generated image
 */
async function overlayFrame(imageBuffer: Buffer): Promise<Buffer> {
  console.log(`🖼️ Overlaying frame on generated image`);
  console.time('frame-overlay');

  // Path to the background frame
  const framePath = join(__dirname, 'background.png');

  // Get the dimensions of the generated image
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const { width, height } = metadata;

  if (!width || !height) {
    console.error('Failed to get image dimensions');
    return imageBuffer; // Return original if we can't get dimensions
  }

  // Resize the frame to match the generated image dimensions and overlay it
  const framedImage = await image
    .composite([
      {
        input: await sharp(framePath)
          .resize(width, height, { fit: 'fill' })
          .toBuffer(),
        top: 0,
        left: 0,
      }
    ])
    .png()
    .toBuffer();

  console.timeEnd('frame-overlay');
  return framedImage;
}

/**
 * API endpoint to generate and print image
 */
app.post('/api/generate', async (c) => {
  const body = await c.req.json();
  const { prompt, enablePrinter = true } = body;

  if (!prompt) {
    return c.json({ error: 'Prompt is required' }, 400);
  }

  try {
    // Generate the image
    const buffer = await generateImage(prompt);

    if (!buffer) {
      return c.json({ error: 'Failed to generate image' }, 500);
    }

    // Print the image if enabled
    if (!enablePrinter) {
      console.log('🖨️ Printing disabled by user - skipping print job');
    } else {
      try {
        const printResult = await printToUSB(buffer, {
          fitToPage: true,
          copies: 1
        });
        console.log(`✅ Print job submitted to ${printResult.printerName}`);
      } catch (printError) {
        console.warn('⚠️ Printing failed:', printError);
        // Continue even if printing fails - still return the image
      }
    }

    // Send the image back to the client
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
      },
    });

  } catch (error) {
    console.error('Error:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * API endpoint to convert photo to coloring page and print
 */
app.post('/api/generate-from-photo', async (c) => {
  try {
    let imageBase64: string;
    let mimeType: string;
    let scene: string;
    let enablePrinter: boolean;

    const contentType = c.req.header('content-type') || '';

    // Handle FormData (multipart/form-data)
    if (contentType.includes('multipart/form-data')) {
      const formData = await c.req.formData();
      const imageFile = formData.get('image') as File;

      if (!imageFile) {
        return c.json({ error: 'Image file is required' }, 400);
      }

      // Read file as array buffer and convert to base64
      const arrayBuffer = await imageFile.arrayBuffer();
      imageBase64 = Buffer.from(arrayBuffer).toString('base64');
      mimeType = imageFile.type || 'image/jpeg';

      // Get scene parameter, with default fallback
      scene = (formData.get('scene') as string) || 'dancing on a disco floor with disco ball and dance floor tiles';

      // Get printer enable flag, default to false
      enablePrinter = (formData.get('enablePrinter') as string) === 'true';

    }
    // Handle JSON with base64 image
    else {
      const body = await c.req.json();

      if (!body.image || !body.mimeType) {
        return c.json({ error: 'Image data and mimeType are required' }, 400);
      }

      imageBase64 = body.image;
      mimeType = body.mimeType;
      scene = body.scene || 'dancing on a disco floor with disco ball and dance floor tiles';
      enablePrinter = body.enablePrinter === true;
    }

    // Validate mime type
    if (!mimeType.startsWith('image/')) {
      return c.json({ error: 'Invalid image format' }, 400);
    }

    // Convert photo to coloring page
    let buffer = await convertPhotoToColoringPage(imageBase64, mimeType, scene);

    if (!buffer) {
      return c.json({ error: 'Failed to convert photo to coloring page' }, 500);
    }

    // Overlay the frame on top of the generated image
    buffer = await overlayFrame(buffer);

    // Print the image if enabled
    if (!enablePrinter) {
      console.log('🖨️ Printing disabled by user - skipping print job');
    } else {
      try {
        const printResult = await printToUSB(buffer, {
          fitToPage: true,
          copies: 1
        });
        console.log(`✅ Print job submitted to ${printResult.printerName}`);
      } catch (printError) {
        console.warn('⚠️ Printing failed:', printError);
        // Continue even if printing fails - still return the image
      }
    }

    // Send the image back to the client
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
      },
    });

  } catch (error) {
    console.error('Error:', error);
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

serve({
  fetch: app.fetch,
  port: PORT,
}, (info) => {
  console.log(`🚀 Server running at http://localhost:${info.port}`);
});

