const axios = require('axios');
const { list } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  try {
    // List blobs to find the exact URL of latest/index.html
    const { blobs } = await list({ prefix: 'latest/index.html', limit: 1 });
    
    if (!blobs || blobs.length === 0) {
      // Fallback: Redirect to the static index.html if it exists
      return res.redirect(302, '/index.html');
    }

    const latestBlobUrl = blobs[0].url;

    // Fetch and proxy the HTML content
    const fetchRes = await axios.get(latestBlobUrl, { responseType: 'arraybuffer' });
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline');
    // Ensure we don't cache this aggressively so the "latest" always stays fresh
    res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate=59');
    
    return res.send(fetchRes.data);
  } catch (error) {
    console.error('Error fetching latest blob:', error.message);
    // Fallback: Redirect to the static index.html on any error (like missing token)
    return res.redirect(302, '/index.html');
  }
};
