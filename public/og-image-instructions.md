# Social Share Image (OG Image) Instructions

## Current Setup
- **SVG Version**: `/public/og-image.svg` - A placeholder SVG image for social sharing
- **HTML Template**: `/public/og-image-template.html` - A more detailed HTML template for generating PNG

## Generate PNG from SVG or HTML

### Option 1: Using an online converter
1. Open `og-image.svg` or `og-image-template.html` in a browser
2. Use a tool like:
   - https://cloudconvert.com/svg-to-png
   - https://convertio.co/svg-png/
   - Chrome DevTools screenshot feature

### Option 2: Using command line (requires ImageMagick)
```bash
# Convert SVG to PNG
convert -density 300 -background none og-image.svg -resize 1200x630 og-image.png

# Or using rsvg-convert
rsvg-convert -w 1200 -h 630 og-image.svg > og-image.png
```

### Option 3: Using Puppeteer or Playwright (Node.js)
```javascript
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630 });
  await page.goto(`file://${__dirname}/og-image-template.html`);
  await page.screenshot({ path: 'og-image.png' });
  await browser.close();
})();
```

## Image Requirements
- **Dimensions**: 1200x630 pixels (recommended by Facebook/Twitter)
- **Format**: PNG (better compatibility than SVG)
- **File Size**: Keep under 5MB
- **Content**: Clear branding, title, and key features

## Testing Your OG Image
1. Facebook Sharing Debugger: https://developers.facebook.com/tools/debug/
2. Twitter Card Validator: https://cards-dev.twitter.com/validator
3. LinkedIn Post Inspector: https://www.linkedin.com/post-inspector/

## Current Implementation
The metadata in `/src/app/[locale]/(default)/page.tsx` references:
- `${process.env.NEXT_PUBLIC_WEB_URL}/og-image.png`

Make sure to:
1. Generate the PNG version from the SVG or HTML template
2. Save it as `og-image.png` in the `/public` directory
3. Test with the validators above after deployment