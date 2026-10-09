const tripData = [
  {
    name: "桃園機場第一航廈",
    time: "13:30 - 15:30",
    address: "台灣 33758 台灣 大園區 第一航廈出境道路",
    tel: "",
    transport: {
      mode: "transit", 
      icon: "fa-plane",
      duration: "2 小時 50 分鐘"
    }
  },
  {
    name: "關西國際機場",
    time: "19:30 - 20:30",
    address: "1番地 Senshukukokita, Izumisano, Osaka 549-0001日本",
    tel: "+81724552500",
    transport: {
      mode: "transit",
      icon: "fa-train",
      duration: "1 小時 3 分鐘"
    }
  },
  {
    name: "DEL style 大阪心齋橋 by 大和Roynet飯店",
    time: "22:00 - 23:00",
    address: "3 Chome-9-8 Minamisenba, Chuo Ward, Osaka, 542-0081日本",
    tel: "+81665757155",
    transport: {
      mode: "walking",
      icon: "fa-person-walking",
      duration: "15 分鐘"
    }
  },
  {
    name: "唐吉訶德 道頓堀御堂筋店",
    time: "23:15 - 00:15",
    address: "2 Chome-5-9 Nishishinsaibashi, Chuo Ward, Osaka, 542-0086日本",
    tel: "+81570063911",
    transport: null
  }
];

function createGoogleMapsAddressLink(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function createGoogleMapsDirLink(origin, destination, mode) {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${mode}`;
}

function renderTimeline() {
  const container = document.getElementById('timeline');
  let html = '';

  tripData.forEach((poi, index) => {
    // POI Card
    html += `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="poi-card">
          <div class="poi-time"><i class="fa-regular fa-clock"></i> ${poi.time}</div>
          <h2 class="poi-name">${poi.name}</h2>
          <div class="poi-details">
            <a href="${createGoogleMapsAddressLink(poi.address)}" target="_blank" class="detail-item" title="點擊開啟 Google Maps">
              <i class="fa-solid fa-location-dot"></i>
              <span>${poi.address}</span>
            </a>
            ${poi.tel ? `
            <a href="tel:${poi.tel}" class="detail-item" title="撥打電話">
              <i class="fa-solid fa-phone"></i>
              <span>${poi.tel}</span>
            </a>` : ''}
          </div>
        </div>
      </div>
    `;

    // Transport Connector (if not the last item)
    if (poi.transport && index < tripData.length - 1) {
      const nextPoi = tripData[index + 1];
      const dirLink = createGoogleMapsDirLink(poi.address, nextPoi.address, poi.transport.mode);
      
      html += `
        <div class="transport-connector" style="animation-delay: ${0.2 * index + 0.3}s">
          <a href="${dirLink}" target="_blank" class="transport-link" title="點擊開啟導航">
            <i class="fa-solid ${poi.transport.icon}"></i>
            <span>${poi.transport.duration}</span>
            <i class="fa-solid fa-chevron-right" style="font-size: 0.8rem; margin-left: 4px;"></i>
          </a>
        </div>
      `;
    }
  });

  container.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', renderTimeline);
