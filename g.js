const API_KEYS = {
    pixabay: '35709281-7cfc5f6b665218524f6ef93d0',
    pexels: '',
    unsplash: ''
};

const gallery = document.getElementById('gallery');
const spinner = document.getElementById('spinner');
const statusMessage = document.getElementById('statusMessage');
const imageCountSelect = document.getElementById('imageCount');
const imageCountSlider = document.getElementById('imageCountSlider');
const modeToggle = document.getElementById('modeToggle');
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const clearSearchButton = document.getElementById('clearSearchButton');
const sortOrderSelect = document.getElementById('sortOrder');
const sourceSelect = document.getElementById('sourceSelect');
const favoritesToggle = document.getElementById('favoritesToggle');
const backToTopButton = document.getElementById('backToTop');

const STORAGE_KEYS = {
    darkMode: 'gallery-dark-mode',
    columns: 'gallery-columns',
    favorites: 'gallery-favorites',
    query: 'gallery-query',
    sort: 'gallery-sort',
    source: 'gallery-source'
};

const ALL_SOURCES = ['pixabay', 'pexels', 'unsplash', 'picsum', 'wikimedia', 'nasa'];
const PER_PAGE = 20;
const LOAD_COOLDOWN_MS = 1200;

let page = 1;
let selectedIndex = -1;
let darkMode = localStorage.getItem(STORAGE_KEYS.darkMode) === 'true';
let isLoading = false;
let hasMore = true;
let lastLoadAt = 0;
let activeQuery = localStorage.getItem(STORAGE_KEYS.query) || '';
let activeSortOrder = localStorage.getItem(STORAGE_KEYS.sort) || 'popular';
let activeSource = localStorage.getItem(STORAGE_KEYS.source) || 'all';
let showFavoritesOnly = false;
let allSourceCursor = 0;
let sourceCooldownUntil = {};
let favoriteIds = new Set((JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) || '[]') || []).map((id) => String(id)));

initializePreferences();
loadImages(true);

modeToggle.addEventListener('click', () => {
    darkMode = !darkMode;
    localStorage.setItem(STORAGE_KEYS.darkMode, darkMode.toString());
    applyTheme();
});

searchButton.addEventListener('click', () => {
    const nextQuery = searchInput.value.trim();
    if (nextQuery === activeQuery) {
        return;
    }

    activeQuery = nextQuery;
    localStorage.setItem(STORAGE_KEYS.query, activeQuery);
    refreshGallery();
});

clearSearchButton.addEventListener('click', () => {
    searchInput.value = '';
    if (!activeQuery) {
        return;
    }

    activeQuery = '';
    localStorage.setItem(STORAGE_KEYS.query, activeQuery);
    refreshGallery();
});

searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        searchButton.click();
    }
});

sortOrderSelect.addEventListener('input', (event) => {
    activeSortOrder = event.target.value;
    localStorage.setItem(STORAGE_KEYS.sort, activeSortOrder);
    refreshGallery();
});

sourceSelect.addEventListener('input', (event) => {
    activeSource = event.target.value;
    localStorage.setItem(STORAGE_KEYS.source, activeSource);
    allSourceCursor = 0;
    refreshGallery();
});

favoritesToggle.addEventListener('click', () => {
    showFavoritesOnly = !showFavoritesOnly;
    favoritesToggle.textContent = showFavoritesOnly ? 'Show All' : 'Show Favorites';
    refreshGallery();
});

imageCountSelect.addEventListener('input', (event) => {
    const columns = event.target.value;
    imageCountSlider.value = columns;
    localStorage.setItem(STORAGE_KEYS.columns, columns);
    updateGalleryLayout(columns);
});

imageCountSlider.addEventListener('input', (event) => {
    const columns = event.target.value;
    imageCountSelect.value = columns;
    localStorage.setItem(STORAGE_KEYS.columns, columns);
    updateGalleryLayout(columns);
});

window.addEventListener('scroll', () => {
    backToTopButton.classList.toggle('show', window.scrollY > 500);

    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500 && !isLoading && !showFavoritesOnly && hasMore) {
        loadImages();
    }
});

backToTopButton.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.addEventListener('keydown', (event) => {
    const key = event.key;
    const imageBoxes = document.querySelectorAll('.image-box');
    const columns = parseInt(imageCountSelect.value, 10);
    const totalImages = imageBoxes.length;

    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(key) || totalImages === 0) {
        return;
    }

    event.preventDefault();

    let temp = selectedIndex;
    if (selectedIndex >= 0) {
        deselectImage();
    }

    if (temp === -1) {
        selectedIndex = 0;
    } else {
        switch (key) {
            case 'ArrowDown':
                selectedIndex = Math.min(temp + columns, totalImages - 1);
                break;
            case 'ArrowUp':
                selectedIndex = Math.max(temp - columns, 0);
                break;
            case 'ArrowLeft':
                selectedIndex = Math.max(temp - 1, 0);
                break;
            case 'ArrowRight':
                selectedIndex = Math.min(temp + 1, totalImages - 1);
                break;
        }
    }

    selectImage(selectedIndex);
});

document.addEventListener('click', (event) => {
    if (!gallery.contains(event.target)) {
        deselectImage();
    }
});

function initializePreferences() {
    const savedColumns = localStorage.getItem(STORAGE_KEYS.columns) || imageCountSelect.value;
    imageCountSelect.value = savedColumns;
    imageCountSlider.value = savedColumns;
    searchInput.value = activeQuery;
    sortOrderSelect.value = activeSortOrder;
    sourceSelect.value = activeSource;
    updateGalleryLayout(savedColumns);
    applyTheme();
}

function applyTheme() {
    if (darkMode) {
        document.body.classList.add('dark-mode');
        modeToggle.textContent = '☀';
    } else {
        document.body.classList.remove('dark-mode');
        modeToggle.textContent = '🌙';
    }
}

function updateGalleryLayout(columns) {
    gallery.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    deselectImage();
}

function setStatus(message) {
    if (!statusMessage) {
        return;
    }
    statusMessage.textContent = message || '';
}

function normalizeImage(source, id, thumbUrl, fullUrl, title) {
    return {
        source,
        id: `${source}:${id}`,
        thumbUrl,
        fullUrl,
        fallbackUrl: fullUrl || thumbUrl,
        title: title || 'image'
    };
}

function isSupportedImageUrl(url) {
    if (!url) {
        return false;
    }

    try {
        const parsed = new URL(url);
        const pathname = parsed.pathname.toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg'].some((ext) => pathname.endsWith(ext));
    } catch (error) {
        return false;
    }
}

function sourceNeedsKey(source) {
    return source === 'pexels' || source === 'unsplash';
}

function hasSourceKey(source) {
    if (!sourceNeedsKey(source)) {
        return true;
    }
    return Boolean(API_KEYS[source]);
}

function getEnabledSources() {
    return ALL_SOURCES.filter((source) => hasSourceKey(source));
}

async function getJson(url, options = {}, sourceName = 'source') {
    const response = await fetch(url, options);

    if (!response.ok) {
        const error = new Error(`Request failed for ${sourceName}: ${response.status}`);
        error.status = response.status;
        error.source = sourceName;
        const retryAfterHeader = response.headers.get('Retry-After');
        const parsedRetryAfter = Number.parseInt(retryAfterHeader || '60', 10);
        error.retryAfterSeconds = Number.isFinite(parsedRetryAfter) ? parsedRetryAfter : 60;
        throw error;
    }

    return response.json();
}

function getSourcePage(source) {
    return page;
}

async function fetchPixabay() {
    const params = new URLSearchParams({
        key: API_KEYS.pixabay,
        page: String(getSourcePage('pixabay')),
        per_page: String(PER_PAGE),
        order: activeSortOrder
    });

    if (activeQuery) {
        params.append('q', activeQuery);
    }

    const data = await getJson(`https://pixabay.com/api/?${params.toString()}`, {}, 'pixabay');
    return (data.hits || []).map((image) =>
        normalizeImage('pixabay', image.id, image.webformatURL, image.largeImageURL, image.tags)
    );
}

async function fetchPexels() {
    if (!API_KEYS.pexels) {
        setStatus('Pexels key missing in g.js. Add it to enable Pexels.');
        return [];
    }

    const baseUrl = activeQuery ? 'https://api.pexels.com/v1/search' : 'https://api.pexels.com/v1/curated';
    const params = new URLSearchParams({
        page: String(getSourcePage('pexels')),
        per_page: String(PER_PAGE)
    });

    if (activeQuery) {
        params.append('query', activeQuery);
    }

    const data = await getJson(`${baseUrl}?${params.toString()}`, {
        headers: {
            Authorization: API_KEYS.pexels
        }
    }, 'pexels');

    return (data.photos || []).map((image) =>
        normalizeImage('pexels', image.id, image.src.medium, image.src.original, image.photographer)
    );
}

async function fetchUnsplash() {
    if (!API_KEYS.unsplash) {
        setStatus('Unsplash key missing in g.js. Add it to enable Unsplash.');
        return [];
    }

    const params = new URLSearchParams({
        page: String(getSourcePage('unsplash')),
        per_page: String(PER_PAGE)
    });

    let url = 'https://api.unsplash.com/photos';
    if (activeQuery) {
        url = 'https://api.unsplash.com/search/photos';
        params.append('query', activeQuery);
    } else {
        params.append('order_by', activeSortOrder === 'latest' ? 'latest' : 'popular');
    }

    const data = await getJson(`${url}?${params.toString()}`, {
        headers: {
            Authorization: `Client-ID ${API_KEYS.unsplash}`
        }
    }, 'unsplash');

    const results = activeQuery ? (data.results || []) : (data || []);

    return results.map((image) =>
        normalizeImage('unsplash', image.id, image.urls.small, image.urls.full, image.alt_description)
    );
}

async function fetchPicsum() {
    if (activeQuery) {
        return [];
    }

    const data = await getJson(`https://picsum.photos/v2/list?page=${getSourcePage('picsum')}&limit=${PER_PAGE}`, {}, 'picsum');
    return (data || []).map((image) =>
        normalizeImage('picsum', image.id, `https://picsum.photos/id/${image.id}/600/600`, image.download_url, image.author)
    );
}

async function fetchWikimedia() {
    const searchTerm = activeQuery || 'nature';
    const params = new URLSearchParams({
        action: 'query',
        format: 'json',
        origin: '*',
        generator: 'search',
        gsrsearch: `${searchTerm} filetype:bitmap`,
        gsrlimit: String(PER_PAGE),
        gsroffset: String((getSourcePage('wikimedia') - 1) * PER_PAGE),
        prop: 'imageinfo',
        iiprop: 'url',
        iiurlwidth: '800'
    });

    const data = await getJson(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {}, 'wikimedia');
    const pages = data.query && data.query.pages ? Object.values(data.query.pages) : [];

    return pages
        .filter((item) => item.imageinfo && item.imageinfo[0] && item.imageinfo[0].url)
        .map((image) => {
            const info = image.imageinfo[0];
            const thumb = info.thumburl || info.url;
            return normalizeImage('wikimedia', image.pageid, thumb, info.url, image.title);
        })
        .filter((image) => isSupportedImageUrl(image.thumbUrl));
}

async function fetchNasa() {
    const searchTerm = activeQuery || 'earth';
    const params = new URLSearchParams({
        q: searchTerm,
        media_type: 'image',
        page: String(getSourcePage('nasa'))
    });

    const data = await getJson(`https://images-api.nasa.gov/search?${params.toString()}`, {}, 'nasa');
    const items = data.collection && data.collection.items ? data.collection.items : [];

    return items
        .filter((item) => item.links && item.links.length > 0)
        .map((item, index) => {
            const nasaTitle = item.data && item.data[0] ? item.data[0].title : 'NASA image';
            const candidate = item.links.find((link) => isSupportedImageUrl(link.href)) || item.links[0];
            const imageUrl = candidate ? candidate.href : '';
            return normalizeImage('nasa', `${page}-${index}`, imageUrl, imageUrl, nasaTitle);
        })
        .filter((image) => isSupportedImageUrl(image.thumbUrl));
}

function canCallSource(source) {
    const cooldownUntil = sourceCooldownUntil[source] || 0;
    return Date.now() >= cooldownUntil;
}

async function safelyFetch(sourceName, fetcher) {
    if (!canCallSource(sourceName)) {
        return [];
    }

    try {
        return await fetcher();
    } catch (error) {
        if (error.status === 429) {
            const cooldownMs = (error.retryAfterSeconds || 60) * 1000;
            sourceCooldownUntil[sourceName] = Date.now() + cooldownMs;
            setStatus(`${sourceName} rate-limited. Retrying after cooldown.`);
            return [];
        }

        if (error.status === 401 || error.status === 403) {
            setStatus(`${sourceName} authorization failed. Check API key.`);
            return [];
        }

        console.warn(`Source fetch failed (${sourceName}):`, error);
        return [];
    }
}

async function fetchFromSingleSource(sourceName) {
    const sourceMap = {
        pixabay: fetchPixabay,
        pexels: fetchPexels,
        unsplash: fetchUnsplash,
        picsum: fetchPicsum,
        wikimedia: fetchWikimedia,
        nasa: fetchNasa
    };

    return safelyFetch(sourceName, sourceMap[sourceName]);
}

async function fetchFromAllSourcesBalanced() {
    const enabledSources = getEnabledSources();
    if (enabledSources.length === 0) {
        setStatus('No enabled sources. Add API keys for key-required sources.');
        return [];
    }

    for (let attempt = 0; attempt < enabledSources.length; attempt++) {
        const currentIndex = (allSourceCursor + attempt) % enabledSources.length;
        const source = enabledSources[currentIndex];

        if (!canCallSource(source)) {
            continue;
        }

        const items = await fetchFromSingleSource(source);
        if (items.length > 0) {
            allSourceCursor = (currentIndex + 1) % enabledSources.length;
            setStatus(`Loaded from ${source}.`);
            return items;
        }
    }

    setStatus('No images available right now. Some sources may be in cooldown.');
    return [];
}

async function fetchImages() {
    if (activeSource !== 'all') {
        return fetchFromSingleSource(activeSource);
    }

    return fetchFromAllSourcesBalanced();
}

function displayImages(images) {
    let imagesToRender = images;
    if (showFavoritesOnly) {
        imagesToRender = images.filter((image) => favoriteIds.has(image.id));
    }

    imagesToRender.forEach((image) => {
        const imageBox = document.createElement('div');
        imageBox.classList.add('image-box');

        const imgElement = document.createElement('img');
        imgElement.dataset.src = image.thumbUrl;
        imgElement.classList.add('lazy');
        imgElement.alt = image.title;
        imgElement.loading = 'lazy';
        imgElement.addEventListener('error', () => {
            if (image.fallbackUrl && imgElement.src !== image.fallbackUrl) {
                imgElement.src = image.fallbackUrl;
                return;
            }

            imageBox.remove();
            if (selectedIndex >= gallery.querySelectorAll('.image-box').length) {
                selectedIndex = -1;
            }
        });
        imageBox.appendChild(imgElement);

        const itemIndex = gallery.querySelectorAll('.image-box').length;
        imageBox.addEventListener('click', () => selectImage(itemIndex));

        const favoriteButton = document.createElement('button');
        favoriteButton.classList.add('favorite-button');
        favoriteButton.textContent = favoriteIds.has(image.id) ? '♥' : '♡';
        if (favoriteIds.has(image.id)) {
            favoriteButton.classList.add('active');
        }
        favoriteButton.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleFavorite(image.id, favoriteButton);
        });
        imageBox.appendChild(favoriteButton);

        const downloadButton = document.createElement('button');
        downloadButton.textContent = 'Download';
        downloadButton.classList.add('download-button');
        downloadButton.addEventListener('click', (event) => {
            event.stopPropagation();
            downloadImage(image.fullUrl);
        });
        imageBox.appendChild(downloadButton);

        const sourceBadge = document.createElement('span');
        sourceBadge.classList.add('source-badge');
        sourceBadge.textContent = image.source;
        imageBox.appendChild(sourceBadge);

        gallery.appendChild(imageBox);
    });

    lazyLoadImages();
}

function toggleFavorite(imageId, buttonElement) {
    if (favoriteIds.has(imageId)) {
        favoriteIds.delete(imageId);
        buttonElement.textContent = '♡';
        buttonElement.classList.remove('active');
    } else {
        favoriteIds.add(imageId);
        buttonElement.textContent = '♥';
        buttonElement.classList.add('active');
    }

    localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...favoriteIds]));

    if (showFavoritesOnly) {
        refreshGallery();
    }
}

function downloadImage(url) {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'image.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function lazyLoadImages() {
    const lazyImages = document.querySelectorAll('img.lazy');
    const observer = new IntersectionObserver((entries, self) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                img.classList.add('lazy-loaded');
                self.unobserve(img);
            }
        });
    }, {
        rootMargin: '0px 0px 200px 0px',
        threshold: 0
    });

    lazyImages.forEach((image) => {
        observer.observe(image);
    });
}

async function loadImages(reset = false) {
    if (isLoading || (!hasMore && !reset)) {
        return;
    }

    const now = Date.now();
    if (!reset && now - lastLoadAt < LOAD_COOLDOWN_MS) {
        return;
    }
    lastLoadAt = now;

    isLoading = true;
    spinner.style.display = 'block';

    if (reset) {
        page = 1;
        hasMore = true;
        gallery.innerHTML = '';
        selectedIndex = -1;
        setStatus('');
    }

    const images = await fetchImages();

    if (images.length === 0 && activeSource !== 'all') {
        hasMore = false;
        setStatus(`No more results from ${activeSource}. Try another source or search.`);
    }

    if (images.length > 0) {
        displayImages(images);
        page++;
    }

    spinner.style.display = 'none';
    isLoading = false;
}

function refreshGallery() {
    loadImages(true);
}

function selectImage(index) {
    const imageBoxes = document.querySelectorAll('.image-box');
    if (imageBoxes.length === 0 || !imageBoxes[index]) {
        return;
    }

    if (selectedIndex >= 0 && imageBoxes[selectedIndex]) {
        imageBoxes[selectedIndex].classList.remove('selected');
    }

    imageBoxes[index].classList.add('selected');
    imageBoxes[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    selectedIndex = index;
}

function deselectImage() {
    const imageBoxes = document.querySelectorAll('.image-box');
    if (selectedIndex >= 0 && imageBoxes[selectedIndex]) {
        imageBoxes[selectedIndex].classList.remove('selected');
    }
    selectedIndex = -1;
}
