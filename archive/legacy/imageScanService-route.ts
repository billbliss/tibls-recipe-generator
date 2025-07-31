// This route is a thin wrapper around the scanImageBuffer service.
// It exists mainly for manual testing or debugging: you can POST an image file and get the scan result as JSON.
// In normal usage (e.g., from the webhook), scanImageBuffer() is invoked directly in-process without going through HTTP.
app.post(
  '/scan-image',
  upload.single('imageFile'),
  async (req: Request, res: Response): Promise<void> => {
    const imageFile = req.file?.buffer as Buffer;
    if (!imageFile) {
      res.status(400).json({ error: 'Missing image file in request body.' });
      return;
    } else {
      try {
        const scanResult = await scanImageBuffer(imageFile);
        res.json(scanResult);
      } catch (err: any) {
        log('Error scanning image:', err);
        res.status(500).json({ error: err.message || 'Failed to scan the image.' });
      }
    }
  }
);
