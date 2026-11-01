/* Weatherly: plain JavaScript, shared safely between both pages. */
(() => {
  'use strict';
  const contactForm = document.getElementById('contact-form');
  if (contactForm) contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!contactForm.reportValidity()) return;
    const fields = new FormData(contactForm);
    const contents = `Weatherly feedback\n\nName: ${fields.get('name')}\nEmail: ${fields.get('email')}\nSubject: ${fields.get('subject')}\n\n${fields.get('message')}\n`;
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'weatherly-message.txt';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    document.getElementById('contact-status').textContent = 'Your message file is ready. It has not been sent online.';
  });

  const form = document.getElementById('search-form');
  if (!form) return;
  const input = document.getElementById('input-country');
  const cards = document.getElementById('weather-cards');
  const status = document.getElementById('weather-status');
  const locate = document.getElementById('use-location');
  let controller;
  let requestId = 0;
  let unit = 'c';
  let latest;
  let searchTimer;
  const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const number = (value) => Number.isFinite(value) ? Math.round(value) : '—';
  const temperature = (value) => number(Number.isFinite(value) ? (unit === 'f' ? value * 9 / 5 + 32 : value) : null);
  function condition(code, isDay = true) {
    if (code === 0) return [isDay ? 'Clear sky' : 'Clear night', isDay ? '☀' : '☾'];
    if ([1, 2].includes(code)) return ['Partly cloudy', isDay ? '⛅' : '☁'];
    if (code === 3) return ['Overcast', '☁'];
    if ([45, 48].includes(code)) return ['Foggy', '≋'];
    if ([51, 53, 55, 56, 57].includes(code)) return ['Drizzle', '☂'];
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['Rain', '☂'];
    if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Snow', '❄'];
    if ([95, 96, 99].includes(code)) return ['Thunderstorms', 'ϟ'];
    return ['Conditions unavailable', '—'];
  }
  // Presentation only: the existing forecast values and requests stay untouched.
  function weatherTheme(code) {
    if (code === 0) return 'clear';
    if ([1, 2].includes(code)) return 'partly';
    if (code === 3) return 'cloudy';
    if ([45, 48].includes(code)) return 'fog';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
    if ([95, 96, 99].includes(code)) return 'storm';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
    return 'cloudy';
  }
  function weatherIllustration(code, isDay = true) {
    const theme = weatherTheme(code);
    const sun = '<g class="art-sun"><g class="sun-rays" stroke="#ffd78b" stroke-width="3" stroke-linecap="round"><path d="M66 14v-7M66 91v-7M28 49h-7M111 49h-7M39 22l-5-5M98 81l-5-5M39 76l-5 5M98 17l-5 5"/></g><circle cx="66" cy="49" r="27" fill="#ffd078"/><circle cx="59" cy="42" r="18" fill="#ffe2a3" opacity=".55"/></g>';
    const moon = '<g class="art-moon"><path d="M83 19a31 31 0 1 0 22 48A29 29 0 0 1 83 19Z" fill="#e0e9ff"/><path d="m39 20 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="#c2d5ff"/><circle cx="116" cy="26" r="2" fill="#e0e9ff"/></g>';
    const cloud = '<g class="art-cloud"><path d="M38 92C9 92 12 58 36 58c0-30 47-39 58-8 27-9 47 9 42 27-2 10-10 15-21 15Z" fill="#c3d9f4"/><path d="M38 83C19 83 25 63 42 66c-1-25 36-31 45-9 22-8 39 4 38 17-1 7-8 9-16 9Z" fill="#f2f7ff" opacity=".9"/></g>';
    const rain = '<g class="art-rain" stroke="#7abfff" stroke-width="4" stroke-linecap="round"><path d="m46 104-5 11M73 104l-5 11M100 104l-5 11"/></g>';
    const snow = '<g class="art-snow" stroke="#d7f6ff" stroke-width="2" stroke-linecap="round"><path d="M45 100v16m-7-12 14 8m0-8-14 8M83 102v16m-7-12 14 8m0-8-14 8M116 99v16m-7-12 14 8m0-8-14 8"/></g>';
    const fog = '<g class="art-fog" stroke="#c5d8ea" stroke-width="4" stroke-linecap="round"><path d="M29 103h70M49 115h74"/></g>';
    const bolt = '<path class="art-bolt" d="m78 86-18 24h15l-5 19 26-30H80l7-13Z" fill="#ffd078"/>';
    const light = isDay ? sun : moon;
    let artwork = theme === 'clear' ? light : theme === 'partly' ? light + cloud : cloud;
    if (theme === 'rain') artwork += rain;
    if (theme === 'snow') artwork += snow;
    if (theme === 'storm') artwork += bolt;
    if (theme === 'fog') artwork += fog;
    return '<svg class="weather-art" viewBox="0 0 156 140" fill="none" aria-hidden="true" focusable="false">' + artwork + '</svg>';
  }
  function windDirection(degrees) {
    if (!Number.isFinite(degrees)) return '';
    return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];
  }
  function displayCard(data, place) {
    const current = data.current;
    const daily = data.daily;
    const currentCondition = condition(current.weather_code, current.is_day === 1);
    document.body.setAttribute('data-weather', weatherTheme(current.weather_code));
    document.body.setAttribute('data-time', current.is_day === 1 ? 'day' : 'night');
    const scene = document.getElementById('sky-illustration');
    const sceneLabel = document.getElementById('sky-condition');
    if (scene) scene.innerHTML = weatherIllustration(current.weather_code, current.is_day === 1);
    if (sceneLabel) sceneLabel.textContent = currentCondition[0];
    document.getElementById('forecast-title').textContent = `${place.name}, ${place.country || 'your location'}`;
    cards.innerHTML = daily.time.slice(0, 3).map((date, index) => {
      // Noon keeps calendar dates stable across browser time zones and DST.
      const day = new Date(`${date}T12:00:00`);
      const weekday = day.toLocaleDateString('en', { weekday: 'long' });
      const shortDate = day.toLocaleDateString('en', { day: 'numeric', month: 'short' });
      if (index === 0) return `<article class="weather-card current" data-weather="${weatherTheme(current.weather_code)}"><div class="card-top"><span class="today-badge">RIGHT NOW</span><time datetime="${escape(date)}">${escape(weekday)}, ${escape(shortDate)}</time></div><h3 class="city-name">${escape(place.name)}</h3><p class="country-name">${escape(place.country || 'Current location')}</p><div class="temperature-row"><span class="temperature">${temperature(current.temperature_2m)}<sup>°${unit.toUpperCase()}</sup></span><span class="weather-symbol" aria-hidden="true">${weatherIllustration(current.weather_code, current.is_day === 1)}</span></div><p class="condition">${currentCondition[0]} · Feels like ${temperature(current.apparent_temperature)}°</p><div class="weather-metrics"><div><span>Humidity</span><strong>${number(current.relative_humidity_2m)}%</strong></div><div><span>Wind</span><strong>${number(current.wind_speed_10m)} km/h ${windDirection(current.wind_direction_10m)}</strong></div><div><span>Rain chance today</span><strong>${number(daily.precipitation_probability_max[0])}%</strong></div></div></article>`;
      const outlook = condition(daily.weather_code[index]);
      return `<article class="weather-card future" data-weather="${weatherTheme(daily.weather_code[index])}"><div class="card-top"><strong>${index === 1 ? 'Tomorrow' : escape(weekday)}</strong><time datetime="${escape(date)}">${escape(shortDate)}</time></div><span class="weather-symbol" aria-hidden="true">${weatherIllustration(daily.weather_code[index])}</span><div><span class="temperature" aria-label="High ${temperature(daily.temperature_2m_max[index])} degrees">${temperature(daily.temperature_2m_max[index])}°</span><span class="low" aria-label="Low ${temperature(daily.temperature_2m_min[index])} degrees">${temperature(daily.temperature_2m_min[index])}°</span></div><p class="condition">${outlook[0]}</p><p class="rain-chance"><i class="fa-solid fa-droplet" aria-hidden="true"></i>${number(daily.precipitation_probability_max[index])}% chance of rain</p></article>`;
    }).join('');
  }
  async function json(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('Weather service is unavailable. Please try again shortly.');
    const data = await response.json();
    if (data.error) throw new Error('Weather service is unavailable. Please try again shortly.');
    return data;
  }
  async function callApi(query) {
    clearTimeout(searchTimer);
    controller?.abort();
    controller = new AbortController();
    const activeController = controller;
    const id = ++requestId;
    const timeout = setTimeout(() => activeController.abort(), 15000);
    status.classList.remove('error');
    status.textContent = latest ? 'Updating the forecast… Previous forecast is shown below.' : 'Getting the latest forecast…';
    cards.setAttribute('aria-busy', 'true');
    try {
      let place = query;
      if (typeof query === 'string') {
        const search = new URLSearchParams({ name: query.trim(), count: '1', language: 'en', format: 'json' });
        const locations = await json(`https://geocoding-api.open-meteo.com/v1/search?${search}`, activeController.signal);
        if (!locations.results?.length) throw new Error('We couldn’t find that city. Try a nearby city or check the spelling.');
        place = locations.results[0];
      }
      const params = new URLSearchParams({ latitude: place.latitude, longitude: place.longitude, current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: 'auto', forecast_days: '3' });
      const data = await json(`https://api.open-meteo.com/v1/forecast?${params}`, activeController.signal);
      if (!data.current || typeof data.current.time !== 'string' || !data.daily || data.daily.time?.length !== 3 || !['weather_code','temperature_2m_max','temperature_2m_min','precipitation_probability_max'].every(key => Array.isArray(data.daily[key]) && data.daily[key].length === 3)) throw new Error('The forecast is incomplete. Please try again.');
      if (id !== requestId) return;
      latest = { data, place };
      displayCard(data, place);
      status.textContent = `Updated ${data.current.time.slice(11, 16)} local time · ${place.name}`;
    } catch (error) {
      if (id !== requestId) return;
      status.classList.add('error');
      status.textContent = error.name === 'AbortError' ? 'The request timed out. Please try again.' : error instanceof TypeError ? 'Unable to connect. Check your internet connection and try again.' : error.message;
      if (latest) status.textContent += ' The previous forecast is still shown.';
    } finally {
      clearTimeout(timeout);
      if (id === requestId) cards.setAttribute('aria-busy', 'false');
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (query.length < 2) { input.setCustomValidity('Enter at least two letters for a city.'); input.reportValidity(); return; }
    input.setCustomValidity('');
    callApi(query);
  });
  input.addEventListener('input', () => {
    input.setCustomValidity('');
    clearTimeout(searchTimer);
    const query = input.value.trim();
    if (query.length >= 3) searchTimer = setTimeout(() => callApi(query), 600);
  });
  document.querySelectorAll('[data-city]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.city; callApi(button.dataset.city); }));
  document.querySelectorAll('[data-unit]').forEach(button => button.addEventListener('click', () => {
    unit = button.dataset.unit;
    document.querySelectorAll('[data-unit]').forEach(item => { const selected = item === button; item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected)); });
    if (latest) displayCard(latest.data, latest.place);
  }));
  locate.addEventListener('click', () => {
    clearTimeout(searchTimer);
    if (!navigator.geolocation) { status.textContent = 'Location is unavailable in this browser. Search for a city instead.'; return; }
    // Invalidate earlier work so it cannot overwrite geolocation feedback.
    controller?.abort();
    const locationRequest = ++requestId;
    cards.setAttribute('aria-busy', 'false');
    locate.disabled = true;
    status.classList.remove('error');
    status.textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition(position => {
      locate.disabled = false;
      if (locationRequest !== requestId) return;
      input.value = '';
      callApi({ latitude: position.coords.latitude, longitude: position.coords.longitude, name: 'Your location', country: `${position.coords.latitude.toFixed(2)}°, ${position.coords.longitude.toFixed(2)}°` });
    }, () => {
      locate.disabled = false;
      if (locationRequest !== requestId) return;
      status.classList.add('error');
      status.textContent = 'Location could not be accessed. Allow location permission or search for a city.';
    }, { timeout: 10000, maximumAge: 300000 });
  });
  // A useful first forecast without an unsolicited location permission prompt.
  callApi({ name: 'Cairo', country: 'Egypt', latitude: 30.0626, longitude: 31.2497 });
})();

