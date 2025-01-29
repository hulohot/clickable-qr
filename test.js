import QRCode from 'qrcode';

// Helper function to create QR code container
function createQRContainer(title) {
    const div = document.createElement('div');
    div.className = 'qr-test';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = title;
    div.appendChild(label);
    return div;
}

// Standard QR Codes
async function generateStandardQRCodes() {
    const container = document.getElementById('standardQR');
    const tests = [
        { text: 'Hello World', title: 'Basic Text' },
        { text: 'https://www.example.com', title: 'URL' },
        { text: '12345678', title: 'Numbers' },
        { text: 'Test@email.com', title: 'Email' }
    ];

    for (const test of tests) {
        const div = createQRContainer(test.title);
        const canvas = document.createElement('canvas');
        await QRCode.toCanvas(canvas, test.text);
        div.insertBefore(canvas, div.firstChild);
        container.appendChild(div);
    }
}

// Colored QR Codes
async function generateColoredQRCodes() {
    const container = document.getElementById('coloredQR');
    const colors = [
        { dark: '#00796B', light: '#E0F2F1', title: 'Green Theme' },
        { dark: '#D32F2F', light: '#FFEBEE', title: 'Red Theme' },
        { dark: '#1976D2', light: '#E3F2FD', title: 'Blue Theme' },
        { dark: '#E65100', light: '#FFF3E0', title: 'Orange Theme' }
    ];

    for (const color of colors) {
        const div = createQRContainer(color.title);
        const canvas = document.createElement('canvas');
        await QRCode.toCanvas(canvas, 'https://example.com', {
            color: {
                dark: color.dark,
                light: color.light
            },
            errorCorrectionLevel: 'H'
        });
        div.insertBefore(canvas, div.firstChild);
        container.appendChild(div);
    }
}

// Styled QR Codes
async function generateStyledQRCodes() {
    const container = document.getElementById('styledQR');
    const styles = [
        { scale: 4, margin: 0, title: 'No Margin' },
        { scale: 2, margin: 4, title: 'Small Size' },
        { scale: 8, margin: 4, title: 'Large Size' },
        { width: 128, margin: 2, title: 'Fixed Width' }
    ];

    for (const style of styles) {
        const div = createQRContainer(style.title);
        const canvas = document.createElement('canvas');
        await QRCode.toCanvas(canvas, 'https://example.com', style);
        div.insertBefore(canvas, div.firstChild);
        container.appendChild(div);
    }
}

// Edge Cases
async function generateEdgeCases() {
    const container = document.getElementById('edgeCases');
    const tests = [
        { text: 'a'.repeat(100), title: 'Long Text' },
        { text: '你好世界', title: 'Unicode Text' },
        { text: '{"key": "value"}', title: 'JSON Data' },
        { text: ' ', title: 'Empty/Space', fallback: 'Empty QR' }
    ];

    for (const test of tests) {
        const div = createQRContainer(test.title);
        const canvas = document.createElement('canvas');
        try {
            const qrText = test.text.trim() === '' && test.fallback ? test.fallback : test.text;
            await QRCode.toCanvas(canvas, qrText, {
                errorCorrectionLevel: 'Q'
            });
            div.insertBefore(canvas, div.firstChild);
        } catch (error) {
            const errorText = document.createElement('div');
            errorText.textContent = 'Generation failed: ' + error.message;
            errorText.style.color = 'red';
            div.insertBefore(errorText, div.firstChild);
        }
        container.appendChild(div);
    }
}

// Generate all test cases
async function generateAllTests() {
    await Promise.all([
        generateStandardQRCodes(),
        generateColoredQRCodes(),
        generateStyledQRCodes(),
        generateEdgeCases()
    ]);
}

generateAllTests(); 