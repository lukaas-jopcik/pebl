# Pebl HQ Visual Assets

This package avoids JPEG entirely.

## Folders

- `original-png/` — original generated PNG bytes, copied without recompression.
- `retina-2x-png/` — 2× lossless PNG exports with mild sharpening for GitHub and Retina displays.

## Recommended GitHub usage

Use the 2× files in the repository:

```html
<img src="assets/readme/retina-2x-png/hero.png" width="100%" alt="Pebl" />
```

GitHub will display the image at the README width while retaining additional source pixels.

## Important

Upscaling cannot recreate detail that was absent in the generated source. The original PNG folder is the true source-of-record; the 2× folder mainly improves browser downsampling and perceived text sharpness.
