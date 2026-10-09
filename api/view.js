const axios = require('axios');

module.exports = async function handler(req, res) {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).send('Missing url parameter');
  }

  // Basic validation to ensure we only proxy Vercel Blob URLs
  if (!url.includes('.public.blob.vercel-storage.com/')) {
    return res.status(403).send('Invalid blob URL');
  }

  try {
    const fetchRes = await axios.get(url, { responseType: 'arraybuffer' });
    
    // Set headers to serve as inline HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline');
    // Cache for 1 year since blobs are immutable
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    
    return res.send(fetchRes.data);
  } catch (error) {
    console.error('Error proxying blob:', error.message);
    return res.status(500).send('無法載入該網頁檔案');
  }
};
