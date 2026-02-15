require('dotenv').config();
const axios = require('axios');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Normalize location (e.g. UK -> GB, USA -> US) for display and API
function normalizeLocation(location) {
  return location
    .trim()
    .replace(/\s*,\s*UK\s*$/i, ',GB')
    .replace(/\s*,\s*USA\s*$/i, ',US')
    .replace(/\s*,\s*United Kingdom\s*$/i, ',GB');
}

// Tomorrow.io weatherCode to description (common codes)
const WEATHER_CODES = {
  1000: 'Clear', 1100: 'Mostly Clear', 1101: 'Partly Cloudy', 1102: 'Mostly Cloudy',
  1001: 'Cloudy', 2000: 'Fog', 2100: 'Light Fog', 4000: 'Drizzle', 4001: 'Rain',
  4200: 'Light Rain', 4201: 'Heavy Rain', 5000: 'Snow', 5001: 'Flurries',
  5100: 'Light Snow', 5101: 'Heavy Snow', 6000: 'Freezing Drizzle', 6001: 'Freezing Rain',
  6200: 'Light Freezing Rain', 6201: 'Heavy Freezing Rain', 7000: 'Ice Pellets',
  7101: 'Heavy Ice Pellets', 7102: 'Light Ice Pellets', 8000: 'Thunderstorm'
};

// Function to fetch weather data from Tomorrow.io - returns { city, temperature, description } or { error: string }
async function fetchWeatherData(city) {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === 'your_openweathermap_api_key') {
    return { error: 'API key not set. Add your Tomorrow.io API key to the .env file.' };
  }
  const normalizedCity = normalizeLocation(city);
  const apiUrl = `https://api.tomorrow.io/v4/weather/realtime?location=${encodeURIComponent(normalizedCity)}&apikey=${apiKey}&units=metric`;

  const tryFetch = async (query) => {
    const u = `https://api.tomorrow.io/v4/weather/realtime?location=${encodeURIComponent(query)}&apikey=${apiKey}&units=metric`;
    const response = await axios.get(u, { headers: { accept: 'application/json' } });
    const data = response.data;
    const values = data?.data?.values;
    const location = data?.location;
    if (!values) throw new Error('Invalid response');
    const temp = values.temperature != null ? values.temperature : values.temperatureApparent;
    const code = values.weatherCode;
    const description = WEATHER_CODES[code] || (code != null ? `Weather code ${code}` : 'N/A');
    const cityName = location?.name || location?.address || query.split(',')[0].trim() || query;
    return {
      city: cityName,
      temperature: (temp != null ? Number(temp).toFixed(2) : '—') + '°C',
      description
    };
  };

  try {
    return await tryFetch(normalizedCity);
  } catch (error) {
    const status = error.response?.status;
    const apiMessage = error.response?.data?.message || error.response?.data?.error;
    if (status === 401) {
      return { error: 'Invalid API key. Check your .env file or get a key from tomorrow.io' };
    }
    if (status === 404 || status === 400) {
      const cityOnly = normalizedCity.split(',')[0].trim();
      if (cityOnly !== normalizedCity) {
        try {
          return await tryFetch(cityOnly);
        } catch (e) {
          // fall through
        }
      }
      return { error: apiMessage || 'Location not found. Try a different spelling or add country code (e.g. London, GB).' };
    }
    if (status === 429) {
      return { error: 'Too many requests. Please try again later.' };
    }
    console.error('Tomorrow.io error:', status, apiMessage || error.message);
    return { error: apiMessage || error.message || 'Could not fetch weather.' };
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (req.method === 'GET' && parsedUrl.pathname === '/') {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
      }
    });
  } else if (req.method === 'GET' && parsedUrl.pathname === '/weather') {
    const location = parsedUrl.query.location;
    if (location) {
      fetchWeatherData(location)
        .then(weatherData => {
          if (weatherData && !weatherData.error) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(weatherData));
          } else {
            const status = weatherData?.error?.includes('Invalid API key') ? 401 : 404;
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: weatherData?.error || 'Location not found' }));
          }
        })
        .catch(error => {
          console.error('An error occurred:', error.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        });
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Location parameter missing' }));
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const port = 3000;
server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
