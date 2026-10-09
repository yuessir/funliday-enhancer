const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { put } = require('@vercel/blob');

async function getPoiCoords(poiUrl) {
  if (!poiUrl) return null;
  if (poiUrl.startsWith('/')) poiUrl = 'https://www.funliday.com' + poiUrl;

  try {
    const res = await axios.get(poiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const matchLat = res.data.match(/"latitude":([\d.-]+)/);
    const matchLng = res.data.match(/"longitude":([\d.-]+)/);
    if (matchLat && matchLng) {
      return { lat: parseFloat(matchLat[1]), lng: parseFloat(matchLng[1]) };
    }
  } catch (e) {
    console.log(`Failed to fetch coords for ${poiUrl}`);
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: '請提供 Funliday 網址' });
  }

  try {
    console.log(`Fetching ${url}...`);
    const fetchRes = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = fetchRes.data;
    const $ = cheerio.load(html);

    const tripTitle = $('h1').first().text().trim() || "Funliday 行程";
    const daysData = [];
    const daySections = $('section.day').toArray();

    for (let dayIndex = 0; dayIndex < daySections.length; dayIndex++) {
      const daySection = daySections[dayIndex];
      const rawPoints = [];
      let currentPoi = null;

      const children = $(daySection).children('div').toArray();

      for (let i = 0; i < children.length; i++) {
        const el = children[i];
        const poiEl = $(el).find('[class*="_poi_"]').first();
        const transEl = $(el).find('[class*="transportation-info"]').first();

        if (poiEl.length > 0) {
          const time = poiEl.find('[class*="poi-time"]').text().replace(/<!-- -->/g, '').trim();
          const nameLink = poiEl.find('h2[class*="poi-name"] a');
          const name = nameLink.text().trim() || poiEl.find('h2[class*="poi-name"]').text().trim();
          const poiUrl = nameLink.attr('href') || null;

          const address = poiEl.find('li[class*="_poiDetailAddress"]').text().trim();
          const tel = poiEl.find('li[class*="_poiDetailTel"]').text().trim();

          let coords = null;
          if (poiUrl) {
            coords = await getPoiCoords(poiUrl);
            console.log(`Fetched coords for ${name}: ${coords ? coords.lat + ',' + coords.lng : 'Not found'}`);
          }

          currentPoi = {
            name,
            time,
            address,
            tel,
            lat: coords ? coords.lat : null,
            lng: coords ? coords.lng : null,
            transport: null
          };
          rawPoints.push(currentPoi);
        }

        if (transEl.length > 0 && currentPoi) {
          const text = transEl.find('[class*="transportation-text"]').text().trim();
          let duration = text.replace('take ', '').replace(' to get there', '');

          const svg = transEl.find('svg').html() || '';
          let mode = 'driving';
          let icon = 'fa-car';

          if (svg.includes('M14.9038952')) {
            mode = 'transit';
            icon = 'fa-plane';
          } else if (svg.includes('M23,3') || svg.includes('M23,3 C24.65')) {
            mode = 'transit';
            icon = 'fa-train';
          } else if (svg.includes('M11.8234132')) {
            mode = 'walking';
            icon = 'fa-person-walking';
          }

          currentPoi.transport = {
            mode,
            icon,
            duration
          };
        }
      }

      // Group by start time for parallel POIs
      const groupedPoints = [];
      rawPoints.forEach(p => {
        const startTimeMatch = p.time.match(/^(\d{2}:\d{2})/);
        const startTime = startTimeMatch ? startTimeMatch[1] : p.time;
        p.startTime = startTime;

        if (groupedPoints.length === 0) {
          groupedPoints.push({ startTime: startTime, pois: [p] });
        } else {
          let lastGroup = groupedPoints[groupedPoints.length - 1];
          if (lastGroup.startTime === startTime) {
            lastGroup.pois.push(p);
          } else {
            groupedPoints.push({ startTime: startTime, pois: [p] });
          }
        }
      });

      if (groupedPoints.length > 0) {
        daysData.push(groupedPoints);
      }
    }

    if (daysData.length === 0) {
      return res.status(400).json({ error: '未找到任何行程點，可能是因為抓取方式失效或網址不正確。' });
    }

    console.log(`Successfully extracted ${daysData.length} days.`);

    // Read CSS content
    const cssPath = path.join(process.cwd(), 'public', 'style.css');
    let cssContent = '';
    if (fs.existsSync(cssPath)) {
        cssContent = fs.readFileSync(cssPath, 'utf8');
    }

    // Function to generate the HTML template
    function generateHTMLTemplate(fileName, defaultDaysStr) {
      return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${tripTitle}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Noto+Sans+TC:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
${cssContent}
    </style>
</head>
<body>
    <div class="app-container">
        <header class="header" id="main-header">
            <h1 class="title">${tripTitle}</h1>
            <p class="subtitle">授權地理位置高亮離我最近的點 🚀 點擊地點與交通直接導航</p>
        </header>
        
        <nav id="nav-container" class="day-nav sticky-nav"></nav>
        
        <div style="text-align: center;">
          <button id="enable-location-btn" class="day-btn" style="background: rgba(0,240,255,0.1); border-color: var(--primary); color: var(--primary); margin-bottom: 30px;" onclick="startLocationTracking()">
            <i class="fa-solid fa-location-crosshairs"></i> 啟用靠近景點高亮功能
          </button>
        </div>
        
        <main class="timeline-container" id="timeline">
        </main>
    </div>
    
    <script>
      const allDaysData = ${JSON.stringify(daysData, null, 2)};
      
      function getRequestedDays() {
        const urlParams = new URLSearchParams(window.location.search);
        const daysParam = urlParams.get('days');
        if (!daysParam) return ${defaultDaysStr};
        
        const requested = new Set();
        const parts = daysParam.split(',');
        parts.forEach(part => {
          if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            for (let i = start; i <= end; i++) {
              if (i > 0 && i <= allDaysData.length) requested.add(i);
            }
          } else {
            const dayNum = Number(part);
            if (dayNum > 0 && dayNum <= allDaysData.length) requested.add(dayNum);
          }
        });
        return Array.from(requested).sort((a,b) => a-b);
      }

      function createGoogleMapsAddressLink(address) {
        if (!address) return '#';
        return 'https://www.google.com/maps/search/?api=1&hl=zh-TW&query=' + encodeURIComponent(address);
      }

      function createGoogleMapsDirLink(origin, destination, mode) {
        if (!origin || !destination) return '#';
        return 'https://www.google.com/maps/dir/?api=1&hl=zh-TW&origin=' + encodeURIComponent(origin) + '&destination=' + encodeURIComponent(destination) + '&travelmode=' + mode;
      }

      let currentActiveTab = 'all';

      window.switchTab = function(tabId) {
        currentActiveTab = tabId;
        renderTimeline();
      };

      function renderTimeline() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('embed') === '1' || urlParams.get('minimal') === '1') {
          document.getElementById('main-header').style.display = 'none';
        }

        const navContainer = document.getElementById('nav-container');
        const container = document.getElementById('timeline');
        let html = '';
        let navHtml = '';
        
        const daysToRender = getRequestedDays();

        navHtml += \`<button class="day-btn \${currentActiveTab === 'all' ? 'active' : ''}" onclick="switchTab('all')">全部</button>\`;
        daysToRender.forEach(dayNum => {
          navHtml += \`<button class="day-btn \${currentActiveTab === dayNum ? 'active' : ''}" onclick="switchTab(\${dayNum})">第 \${dayNum} 天</button>\`;
        });

        const displayDays = currentActiveTab === 'all' ? daysToRender : [currentActiveTab];

        displayDays.forEach(dayNum => {
          const dayIndex = dayNum - 1;
          const dayData = allDaysData[dayIndex];
          if (!dayData) return;

          html += \`
            <div class="day-divider">
              <h2>Day \${dayNum}</h2>
            </div>
          \`;

          dayData.forEach((group, index) => {
            html += \`
              <div class="timeline-item">
                <div class="timeline-dot" id="dot-\${dayNum}-\${index}"></div>
                <div class="poi-time" style="margin-bottom: 15px; display:inline-block; font-size: 1.2rem; background: rgba(0, 240, 255, 0.15); border: 1px solid var(--primary);"><i class="fa-regular fa-clock"></i> \${group.startTime}</div>
                <div class="poi-cards-container">
            \`;
            
            group.pois.forEach(poi => {
              html += \`
                  <div class="poi-card" \${poi.lat ? \`data-lat="\${poi.lat}" data-lng="\${poi.lng}"\` : ''}>
                    <div class="poi-time" style="font-size: 0.85rem; margin-bottom: 8px;">\${poi.time}</div>
                    <h2 class="poi-name">\${poi.name}</h2>
                    <div class="poi-details">
                      <a href="\${createGoogleMapsAddressLink(poi.address)}" target="_blank" class="detail-item" title="點擊開啟 Google Maps">
                        <i class="fa-solid fa-location-dot"></i>
                        <span>\${poi.address || '無地址資訊'}</span>
                      </a>
                      \${poi.tel ? \`
                      <a href="tel:\${poi.tel}" class="detail-item" title="撥打電話">
                        <i class="fa-solid fa-phone"></i>
                        <span>\${poi.tel}</span>
                      </a>\` : ''}
                    </div>
                  </div>
              \`;
            });
            
            html += \`</div></div>\`; 

            if (index < dayData.length - 1) {
              let latestEndTime = -1;
              let originPoi = group.pois[0];
              let transport = group.pois[0].transport;
              
              group.pois.forEach(p => {
                const endMatch = p.time.match(/-\\s*(\\d{2}:\\d{2})/);
                if (endMatch) {
                  const parts = endMatch[1].split(':');
                  const mins = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                  if (mins > latestEndTime) {
                    latestEndTime = mins;
                    originPoi = p;
                    if (p.transport) transport = p.transport;
                  }
                } else {
                  if (p.transport && !transport) transport = p.transport;
                }
              });
              
              if (!transport) {
                transport = group.pois.find(p => p.transport)?.transport;
              }
              
              if (!transport) {
                transport = {
                  mode: 'driving',
                  icon: 'fa-route',
                  duration: '規劃路線'
                };
              }

              if (transport) {
                const nextPoi = dayData[index + 1].pois.find(p => p.address);
                const dirLink = createGoogleMapsDirLink(originPoi ? originPoi.address : '', nextPoi ? nextPoi.address : '', transport.mode);
                
                html += \`
                  <div class="transport-connector" style="animation-delay: \${0.2 * index + 0.3}s">
                    <a href="\${dirLink}" target="_blank" class="transport-link" title="點擊開啟導航">
                      <i class="fa-solid \${transport.icon}"></i>
                      <span>\${transport.duration}</span>
                      <i class="fa-solid fa-chevron-right" style="font-size: 0.8rem; margin-left: 4px;"></i>
                    </a>
                  </div>
                \`;
              }
            }
          });
        });

        navContainer.innerHTML = navHtml;
        container.innerHTML = html;
        
        // 若之前已經啟動過定位，切換選項卡時直接重新高亮，否則等待使用者手動點擊按鈕
        if (window.isLocationTrackingActive && window.lastPosition) {
           updateLocationHighlight(window.lastPosition);
        }
      }

      function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; 
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
      }

      window.isLocationTrackingActive = false;
      window.lastPosition = null;

      function updateLocationHighlight(position) {
          window.lastPosition = position;
          const userLat = position.coords.latitude;
          const userLng = position.coords.longitude;
          
          let closestId = null;
          let minDistance = 500;

          const daysToRender = getRequestedDays();
          daysToRender.forEach(dayNum => {
            const dayIndex = dayNum - 1;
            const dayData = allDaysData[dayIndex];
            if (!dayData) return;

            dayData.forEach((group, gIdx) => {
              group.pois.forEach((poi) => {
                if (poi.lat && poi.lng) {
                  const dist = calculateDistance(userLat, userLng, poi.lat, poi.lng);
                  if (dist < minDistance) {
                    minDistance = dist;
                    closestId = \`dot-\${dayNum}-\${gIdx}\`;
                  }
                }
              });
            });
          });

          document.querySelectorAll('.timeline-dot').forEach(el => el.classList.remove('current-location-pulse'));
          document.querySelectorAll('.timeline-item').forEach(el => el.classList.remove('active-item'));
          
          if (closestId) {
            const dot = document.getElementById(closestId);
            if (dot) {
              dot.classList.add('current-location-pulse');
              dot.closest('.timeline-item').classList.add('active-item');
            }
          }
      }

      window.startLocationTracking = function() {
        if (!navigator.geolocation) {
          alert('您的瀏覽器不支援定位功能！');
          return;
        }
        
        const btn = document.getElementById('enable-location-btn');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 定位中...';
        
        navigator.geolocation.watchPosition(position => {
          window.isLocationTrackingActive = true;
          if (btn) btn.style.display = 'none';
          updateLocationHighlight(position);
        }, err => {
          console.warn('Geolocation error:', err);
          if (btn) btn.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> 啟用靠近景點高亮功能';
          
          if (err.code === 1) {
            alert('定位失敗！您可能拒絕了授權，或是您使用的環境（例如 Notion 嵌入）限制了定位權限。請確認瀏覽器允許讀取位置。');
          } else {
            alert('無法獲取您的位置，請確認 GPS 已開啟且在室外環境。');
          }
        }, {
          enableHighAccuracy: true,
          maximumAge: 10000,
          timeout: 10000
        });
      }

      document.addEventListener('DOMContentLoaded', renderTimeline);
    </script>
</body>
</html>`;
    }

    const blobUrls = [];

    const uploadToBlob = async (fileName, content) => {
      const timestamp = new Date().getTime();
      // append timestamp to make it somewhat unique, or put it in a folder
      // for example: trips/1638202910/index.html
      const blobPath = \`trips/\${timestamp}/\${fileName}\`;
      const blob = await put(blobPath, content, {
        access: 'public',
        contentType: 'text/html; charset=utf-8'
      });
      blobUrls.push({ fileName, url: blob.url });
    };

    // Use a single timestamp prefix for this conversion batch
    const batchId = new Date().getTime();

    const uploadToBlobBatch = async (fileName, content) => {
      const blobPath = \`trips/\${batchId}/\${fileName}\`;
      const blob = await put(blobPath, content, {
        access: 'public',
        contentType: 'text/html; charset=utf-8'
      });
      blobUrls.push({ fileName, url: blob.url });
    };

    console.log("Uploading index.html to Blob...");
    await uploadToBlobBatch('index.html', generateHTMLTemplate('index.html', 'allDaysData.map((d, i) => i + 1)'));

    for (let i = 0; i < daysData.length; i++) {
      const dayNum = i + 1;
      const dayFileName = \`index-d\${dayNum}.html\`;
      console.log(\`Uploading \${dayFileName} to Blob...\`);
      await uploadToBlobBatch(dayFileName, generateHTMLTemplate(dayFileName, \`[\${dayNum}]\`));
    }

    return res.status(200).json({ success: true, title: tripTitle, urls: blobUrls });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: '轉換過程中發生錯誤', details: error.message });
  }
};
