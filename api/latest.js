const axios = require('axios');
const { list } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  try {
    // List blobs to find the exact URL of latest/index.html
    const { blobs } = await list({ prefix: 'latest/index.html', limit: 1 });
    
    if (!blobs || blobs.length === 0) {
      return res.status(404).send(`
        <html>
          <head><meta charset="utf-8"></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h2>尚未轉換任何行程</h2>
            <p>請前往 <a href="/web-converter.html">轉換器</a> 轉換您的第一個行程！</p>
          </body>
        </html>
      `);
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
    return res.status(500).send('無法載入最新行程');
  }
};
