import jsQR from 'jsqr';

// Global variables and functions that need to be accessed across the extension
let isEnabled = true;
const DEBUG = false;
let canvas, ctx, tooltip;

// Helper functions
const debugLog = (...args) => {
    if (DEBUG) console.log(...args);
};

const debugError = (...args) => {
    if (DEBUG) console.error(...args);
};

// Cache for processed images to avoid reprocessing
const processedCache = new WeakMap();

// Move these functions outside of initializeQRDetection so they can be accessed globally
function updateTooltipPosition(e) {
    if (tooltip) {
        tooltip.style.left = (e.pageX + 10) + 'px';
        tooltip.style.top = (e.pageY + 10) + 'px';
    }
}

function makeImageInteractive(img, qrData) {
    if (!tooltip || !isEnabled) return;
    
    img.dataset.qrCode = 'true';
    img.style.cursor = 'pointer';
    
    img.addEventListener('mouseover', (e) => {
        tooltip.textContent = qrData;
        tooltip.style.display = 'block';
        updateTooltipPosition(e);
    });
    
    img.addEventListener('mousemove', updateTooltipPosition);
    
    img.addEventListener('mouseout', () => {
        tooltip.style.display = 'none';
    });
    
    img.addEventListener('click', () => {
        if (qrData.startsWith('http')) {
            window.open(qrData, '_blank');
        }
    });
}

// Initialize function
async function initializeQRDetection() {
    // Create canvas if it doesn't exist
    if (!canvas) {
        canvas = document.createElement('canvas');
        ctx = canvas.getContext('2d');
    }

    // Create tooltip if it doesn't exist
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.className = 'qr-tooltip';
        tooltip.style.display = 'none';
        document.body.appendChild(tooltip);
    }

    // Check initial state
    chrome.storage.local.get(['enabled'], (result) => {
        isEnabled = result.enabled !== false; // Default to true if not set
        if (isEnabled) {
            processAllImages();
        }
    });

    // Function to convert SVG to PNG Image with proper scaling
    function svgToImage(svgElement) {
        return new Promise((resolve, reject) => {
            // Clone the SVG to avoid modifying the original
            const svgClone = svgElement.cloneNode(true);
            
            // Ensure the SVG has explicit dimensions
            if (!svgClone.hasAttribute('width')) {
                svgClone.setAttribute('width', '300');
            }
            if (!svgClone.hasAttribute('height')) {
                svgClone.setAttribute('height', '300');
            }
            
            // Force black and white colors for better QR code detection
            const style = document.createElement('style');
            style.textContent = `
                * {
                    fill: black !important;
                    stroke: black !important;
                    background: white !important;
                }
                rect[fill="white"], rect[style*="fill: white"] {
                    fill: white !important;
                }
            `;
            svgClone.appendChild(style);

            const svgData = new XMLSerializer().serializeToString(svgClone);
            const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
            const svgUrl = URL.createObjectURL(svgBlob);
            
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            // Set a larger size for better QR code detection
            img.width = 300;
            img.height = 300;
            
            img.onload = () => {
                URL.revokeObjectURL(svgUrl);
                resolve(img);
            };
            
            img.onerror = () => {
                URL.revokeObjectURL(svgUrl);
                reject(new Error('Failed to load SVG'));
            };
            
            img.src = svgUrl;
        });
    }

    // Create a debounced version of processAllImages
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Add these color processing functions
    function getRGBLuminance(r, g, b) {
        // Using perceived luminance weights
        return (0.299 * r + 0.587 * g + 0.114 * b);
    }

    function preprocessImageData(imageData) {
        const data = new Uint8ClampedArray(imageData.data);
        const width = imageData.width;
        const height = imageData.height;
        
        // Calculate average color and luminance
        let totalR = 0, totalG = 0, totalB = 0;
        for (let i = 0; i < data.length; i += 4) {
            totalR += data[i];
            totalG += data[i + 1];
            totalB += data[i + 2];
        }
        
        const pixelCount = data.length / 4;
        const avgR = totalR / pixelCount;
        const avgG = totalG / pixelCount;
        const avgB = totalB / pixelCount;
        
        // First pass: adaptive thresholding
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Calculate relative luminance
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
            
            // Detect QR code features using multiple criteria
            const isDarker = luminance < (avgR * 0.299 + avgG * 0.587 + avgB * 0.114) * 0.9;
            const hasColor = Math.abs(r - avgR) > 50 || Math.abs(g - avgG) > 50 || Math.abs(b - avgB) > 50;
            
            // Special handling for colored QR codes
            const isColoredFeature = (
                (r > g + 50 && r > b + 50) || // Red features
                (g > r + 50 && g > b + 50) || // Green features
                (b > r + 50 && b > g + 50) || // Blue features
                (Math.abs(r - g) < 30 && Math.abs(r - b) < 30 && r < 120) // Dark features
            );
            
            // Convert to black or white
            const value = (isDarker || isColoredFeature || (hasColor && luminance < 128)) ? 0 : 255;
            data[i] = data[i + 1] = data[i + 2] = value;
        }

        // Second pass: noise reduction with pattern recognition
        const processed = new Uint8ClampedArray(data);
        for (let y = 2; y < height - 2; y++) {
            for (let x = 2; x < width - 2; x++) {
                const idx = (y * width + x) * 4;
                
                // Check 5x5 grid for pattern recognition
                let darkCount = 0;
                let pattern = 0;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const surroundIdx = ((y + dy) * width + (x + dx)) * 4;
                        if (data[surroundIdx] === 0) {
                            darkCount++;
                            // Record pattern
                            pattern |= 1 << ((dy + 2) * 5 + (dx + 2));
                        }
                    }
                }
                
                // QR code feature detection
                const isFeature = (
                    (darkCount >= 15 && darkCount <= 23) || // Possible finder pattern
                    (darkCount >= 4 && darkCount <= 6) ||   // Possible alignment pattern
                    (darkCount === 1 || darkCount === 2)    // Possible data module
                );
                
                // Apply or remove noise based on feature detection
                if (isFeature) {
                    processed[idx] = processed[idx + 1] = processed[idx + 2] = data[idx];
                } else {
                    // Use surrounding majority
                    processed[idx] = processed[idx + 1] = processed[idx + 2] = 
                        darkCount > 12 ? 0 : 255;
                }
                processed[idx + 3] = 255; // Keep alpha channel
            }
        }

        return new ImageData(processed, width, height);
    }

    // Update the scales to try more variations
    const scales = [1, 1.5, 2, 0.75, 1.25, 0.5];

    // Add padding to the image before processing
    function addPaddingToCanvas(originalCanvas, padding = 20) {
        const newCanvas = document.createElement('canvas');
        newCanvas.width = originalCanvas.width + (padding * 2);
        newCanvas.height = originalCanvas.height + (padding * 2);
        
        const ctx = newCanvas.getContext('2d');
        // Fill with white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);
        // Draw original image in center
        ctx.drawImage(originalCanvas, padding, padding);
        
        return newCanvas;
    }

    // Function to detect if an image is a QR code
    async function processImage(img) {
        if (!isEnabled) return null;
        // Check cache first
        if (processedCache.has(img)) {
            return processedCache.get(img);
        }

        // If the input is a canvas, process it directly
        if (img instanceof HTMLCanvasElement) {
            const result = await processCanvasElement(img);
            processedCache.set(img, result);
            return result;
        }
        
        debugLog('Processing image:', img.src);
        
        // Skip images that are already being processed or have failed CORS
        if (img.dataset.processing === 'true' || img.dataset.corsFailed === 'true') {
            return null;
        }
        
        img.dataset.processing = 'true';

        try {
            let imageToProcess = img;
            
            // Improved SVG detection
            const isSVG = img.src?.toLowerCase().endsWith('.svg') || 
                         img instanceof SVGElement || 
                         img.contentDocument?.documentElement instanceof SVGElement ||
                         (img.nodeName === 'IMG' && img.currentSrc?.includes('svg'));

            if (isSVG) {
                try {
                    debugLog('Converting SVG to image...');
                    const svgElement = img instanceof SVGElement ? 
                        img : 
                        img.contentDocument?.documentElement || 
                        (img.nodeName === 'IMG' ? getSVGFromImg(img) : img);
                        
                    imageToProcess = await svgToImage(svgElement);
                } catch (error) {
                    debugError('Failed to convert SVG:', error);
                    return null;
                }
            } else if (!img.crossOrigin) {
                // Handle regular images with CORS
                img.crossOrigin = 'anonymous';
                const originalSrc = img.src;
                img.src = originalSrc;
                
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = () => {
                        img.dataset.corsFailed = 'true';
                        reject(new Error('Failed to load image with CORS'));
                    };
                });
            }

            // Try different scales with padding
            for (const scale of scales) {
                canvas.width = (imageToProcess.naturalWidth || imageToProcess.width) * scale;
                canvas.height = (imageToProcess.naturalHeight || imageToProcess.height) * scale;
                
                ctx.drawImage(imageToProcess, 0, 0, canvas.width, canvas.height);
                
                // Add padding to help with edge detection
                const paddedCanvas = addPaddingToCanvas(canvas);
                const paddedCtx = paddedCanvas.getContext('2d');
                const imageData = paddedCtx.getImageData(0, 0, paddedCanvas.width, paddedCanvas.height);
                
                const processedImageData = preprocessImageData(imageData);
                
                try {
                    const code = jsQR(processedImageData.data, processedImageData.width, processedImageData.height);
                    if (code) {
                        debugLog('Found QR code:', code.data);
                        const result = code.data;
                        processedCache.set(img, result);
                        return result;
                    }
                } catch (error) {
                    debugError('Error decoding QR code:', error);
                }
            }
            debugLog('No QR code found in image');
            return null;
        } catch (error) {
            debugError('Processing error:', error);
            img.dataset.corsFailed = 'true';
            processedCache.set(img, null);
            return null;
        } finally {
            img.dataset.processing = 'false';
        }
    }

    // Process images in batches
    async function processAllImages() {
        if (!isEnabled) return;
        const batchSize = 5; // Process 5 images at a time
        
        // Process regular images
        const images = Array.from(document.getElementsByTagName('img'));
        debugLog('Found', images.length, 'images on page');
        
        // Filter out likely non-QR code images first
        const potentialQRImages = images.filter(img => {
            const width = img.naturalWidth || img.width || img.clientWidth;
            const height = img.naturalHeight || img.height || img.clientHeight;
            const isSVG = img.src?.toLowerCase().endsWith('.svg') || 
                         img instanceof SVGElement || 
                         img.contentDocument?.documentElement instanceof SVGElement ||
                         (img.nodeName === 'IMG' && img.currentSrc?.includes('svg'));
            
            // Be more lenient with SVGs and small images
            if (isSVG) {
                return true;
            }
            
            // Adjust minimum size to catch smaller QR codes
            return width >= 10 && height >= 10 && width <= 3000 && height <= 3000;
        });

        // Process images in batches
        for (let i = 0; i < potentialQRImages.length; i += batchSize) {
            const batch = potentialQRImages.slice(i, i + batchSize);
            await Promise.all(batch.map(async img => {
                if (img.complete) {
                    const qrData = await processImage(img);
                    if (qrData) makeImageInteractive(img, qrData);
                } else {
                    img.onload = async () => {
                        const qrData = await processImage(img);
                        if (qrData) makeImageInteractive(img, qrData);
                    };
                }
            }));
        }

        // Process SVGs in batches
        const svgs = Array.from(document.getElementsByTagName('svg'));
        debugLog('Found', svgs.length, 'SVGs on page');
        
        for (let i = 0; i < svgs.length; i += batchSize) {
            const batch = svgs.slice(i, i + batchSize);
            await Promise.all(batch.map(async svg => {
                const qrData = await processImage(svg);
                if (qrData) makeImageInteractive(svg, qrData);
            }));
        }

        // Process canvases in batches
        const canvases = Array.from(document.getElementsByTagName('canvas'));
        debugLog('Found', canvases.length, 'canvases on page');
        
        for (let i = 0; i < canvases.length; i += batchSize) {
            const batch = canvases.slice(i, i + batchSize);
            await Promise.all(batch.map(async canvas => {
                const qrData = await processCanvasElement(canvas);
                if (qrData) makeImageInteractive(canvas, qrData);
            }));
        }
    }

    // Function to process canvas elements
    async function processCanvasElement(canvasElement) {
        debugLog('Processing canvas element');
        
        try {
            // Get image data directly from the canvas
            const ctx = canvasElement.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height);
            
            // Try to decode QR code
            try {
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                if (code) {
                    debugLog('Found QR code in canvas:', code.data);
                    return code.data;
                }
            } catch (error) {
                debugError('Error decoding QR code from canvas:', error);
            }
            debugLog('No QR code found in canvas');
            return null;
        } catch (error) {
            debugError('Error processing canvas:', error);
            return null;
        }
    }

    // Create a debounced version of processAllImages
    const debouncedProcessAllImages = debounce(processAllImages, 250);

    // Update the MutationObserver to use debounced processing
    const observer = new MutationObserver((mutations) => {
        if (!isEnabled) return;
        let shouldProcess = false;
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeName === 'IMG' || node.nodeName === 'SVG' || node.nodeName === 'CANVAS') {
                    shouldProcess = true;
                }
            });
        });
        
        if (shouldProcess) {
            debouncedProcessAllImages();
        }
    });

    // Start observing the document
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Initial processing
    processAllImages();
}

// Check stored state before initializing
chrome.storage.local.get(['enabled'], (result) => {
    isEnabled = result.enabled !== false; // Default to true if not set
    if (isEnabled) {
        initializeQRDetection();
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleQR') {
        isEnabled = request.enabled;
        if (!isEnabled) {
            // Hide and remove tooltip
            if (tooltip) {
                tooltip.remove();
                tooltip = null;
            }
            // Remove canvas
            if (canvas) {
                canvas = null;
                ctx = null;
            }
            // Remove all event listeners
            const qrElements = document.querySelectorAll('[data-qr-code="true"]');
            qrElements.forEach(element => {
                element.style.cursor = 'default';
                element.replaceWith(element.cloneNode(true));
            });
        } else {
            // Initialize when enabled
            initializeQRDetection();
        }
    }
});

// Helper function to get SVG element from img
function getSVGFromImg(img) {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(img.outerHTML, 'image/svg+xml');
    return svgDoc.documentElement;
}
