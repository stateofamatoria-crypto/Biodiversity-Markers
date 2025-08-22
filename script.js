document.addEventListener("DOMContentLoaded", function() {
  const map = L.map('map').setView([47.0502, 8.3093], 12); // Lucerne
  const bioLayer = L.layerGroup().addTo(map);
  const markerList = document.getElementById('markerList');
  const bioOverview = document.getElementById('bioOverview');
  let allObservations = [];

  // Map tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OSM contributors'
  }).addTo(map);

  // --- AI-based species classifier ---
  function classifySpecies(speciesName) {
    if (!speciesName) return "Other";
    const name = speciesName.toLowerCase();
    if (/(bird|sparrow|grebe|eagle|owl|pigeon|crow)/.test(name)) return "Bird";
    if (/(fox|deer|rabbit|wolf|cat|dog|squirrel)/.test(name)) return "Mammal";
    if (/(tree|plant|flower|grass|shrub|oak|maple)/.test(name)) return "Plant";
    if (/(mushroom|fungi|toadstool)/.test(name)) return "Fungi";
    if (/(bee|butterfly|ant|fly|insect|dragonfly)/.test(name)) return "Insect";
    if (/(frog|toad|salamander)/.test(name)) return "Amphibian";
    if (/(snake|lizard|turtle)/.test(name)) return "Reptile";
    return "Other";
  }

  // --- AI-inferred biotope ---
  function inferBiotope(speciesName) {
    const name = speciesName.toLowerCase();
    if(/grebe|duck|heron|swan/.test(name)) return "Freshwater lakes and wetlands with reeds";
    if(/robin|sparrow|crow|owl|pigeon/.test(name)) return "Woodlands, urban parks and gardens";
    if(/oak|maple|pine|fir/.test(name)) return "Deciduous or coniferous forests, urban green spaces";
    if(/frog|toad|salamander/.test(name)) return "Ponds, wetlands, and marshy areas";
    if(/bee|butterfly|dragonfly/.test(name)) return "Flower-rich meadows and open habitats";
    if(/mushroom|fungi|toadstool/.test(name)) return "Forests with decaying wood and leaf litter";
    return "Urban areas and mixed habitats";
  }

  // --- AI general biotopes ---
  function generalBiotopes(cityName) {
    const city = cityName.toLowerCase();
    if(city.includes("lucerne") || city.includes("luzern")) {
      return [
        "Alpine forests",
        "Reuss River wetlands",
        "Lake Luzern shoreline habitats",
        "Floodplain meadows",
        "Urban parks and gardens"
      ];
    }
    return ["Forests", "Wetlands", "Rivers", "Meadows", "Urban green spaces"];
  }
  // --- Geocode city ---
  async function geocodeCity(cityName) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}`;
    const res = await axios.get(url);
    return res.data.length ? res.data[0] : null;
  }

  // --- Fetch iNaturalist observations ---
  async function fetchINaturalist(lat, lon, radiusKm=20) {
    const url = `https://api.inaturalist.org/v1/observations?lat=${lat}&lng=${lon}&radius=${radiusKm}&per_page=200`;
    const res = await axios.get(url);
    return res.data.results;
  }

  // --- Apply filters and populate map ---
  function applyFilters() {
    bioLayer.clearLayers();
    markerList.innerHTML = '';

    const selectedTypes = Array.from(document.querySelectorAll('.filter:checked')).map(cb => cb.value);
    const threatenedOnly = document.getElementById('threatenedFilter').checked;
    const invasiveOnly = document.getElementById('invasiveFilter').checked;

    allObservations.forEach(obs => {
      const species = obs.species_guess || obs.taxon?.name || "Unknown";
      const aiType = classifySpecies(species);
      obs.aiType = aiType;
      obs.biotope = inferBiotope(species);

      const threatened = obs.taxon?.threatened || false;
      const invasive = obs.taxon?.establishment_means === "introduced";

      if (selectedTypes.length && !selectedTypes.includes(aiType)) return;
      if (threatenedOnly && !threatened) return;
      if (invasiveOnly && !invasive) return;
      if (!obs.geojson || !obs.geojson.coordinates) return;

      const [lonObs, latObs] = obs.geojson.coordinates;
      const photo = obs.photos && obs.photos[0] ? obs.photos[0].url.replace('square','medium') : null;
      const wikiLink = obs.taxon?.wikipedia_url ? `<br><a href="${obs.taxon.wikipedia_url}" target="_blank">Learn more</a>` : '';

      // Marker
      const marker = L.circleMarker([latObs, lonObs], { radius:5, fillColor:'green', color:'#000', weight:1, fillOpacity:0.7 }).addTo(bioLayer);

      // Popup
      let popupContent = `<b>${species}</b>`;
      if(photo) popupContent += `<br><img src="${photo}" width="100">`;
      popupContent += wikiLink;
      marker.bindPopup(popupContent);

      // Sidebar
      const li = document.createElement('li');
      li.innerHTML = `<b>${species}</b> (${obs.biotope})` + wikiLink;
      markerList.appendChild(li);
    });
  }

  // --- Filter listeners ---
  document.querySelectorAll('.filter').forEach(cb => cb.addEventListener('change', applyFilters));
  document.getElementById('threatenedFilter').addEventListener('change', applyFilters);
  document.getElementById('invasiveFilter').addEventListener('change', applyFilters);

  // --- Load city observations ---
  document.getElementById('loadCity').addEventListener('click', async () => {
    const cityName = document.getElementById('cityInput').value.trim();
    if (!cityName) return alert("Enter a city name");

    bioLayer.clearLayers();
    markerList.innerHTML = '';
    bioOverview.innerHTML = '';
    allObservations = [];

    const city = await geocodeCity(cityName);
    if (!city) return alert("City not found");

    const lat = parseFloat(city.lat);
    const lon = parseFloat(city.lon);
    map.setView([lat, lon], 12);

    allObservations = await fetchINaturalist(lat, lon);

    // AI general biotopes for the city
    const aiBiotopes = generalBiotopes(cityName);
    const observedBiotopesSet = new Set();

    allObservations.forEach(obs => {
      const species = obs.species_guess || obs.taxon?.name || "Unknown";
      obs.biotope = inferBiotope(species);
      observedBiotopesSet.add(obs.biotope);
    });

    const mergedBiotopes = Array.from(new Set([...aiBiotopes, ...observedBiotopesSet]));

    let overviewHTML = `
      <b>Main Issues/Challenges:</b><br>
      Urbanization, habitat fragmentation, invasive species, climate change impacts.<br><br>
      <b>Important Biotopes / Habitats:</b><br>
      ${mergedBiotopes.join(', ')}.<br><br>
      <b>Species Observed:</b>
    `;
    if (!allObservations.length) {
      overviewHTML += '<br>No biodiversity observations found in this city.';
    }
    bioOverview.innerHTML = overviewHTML;

    applyFilters();
  });
});
