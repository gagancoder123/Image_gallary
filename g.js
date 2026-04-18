const apiKey = '35709281-7cfc5f6b665218524f6ef93d0';
const gallery = document.getElementById('gallery');
const spinner = document.getElementById('spinner');
const imageCountSelect = document.getElementById('imageCount');
const imageCountSlider = document.getElementById('imageCountSlider');
const modeToggle = document.getElementById('modeToggle');
let page = 1;
let selectedIndex = -1;
let darkMode = false;

modeToggle.addEventListener('click', () => {
    darkMode = !darkMode;
    applyTheme();
});

function applyTheme() {
    if (darkMode) {
        document.body.classList.add('dark-mode');
        modeToggle.textContent = '☀'; // Sun icon for light mode
    } else {
        document.body.classList.remove('dark-mode');
        modeToggle.textContent = '🌙'; // Moon icon for dark mode
    }
}

imageCountSelect.addEventListener('input', (event) => {
    const columns = event.target.value;
    imageCountSlider.value = columns;
    updateGalleryLayout(columns);
});

imageCountSlider.addEventListener('input', (event) => {
    const columns = event.target.value;
    imageCountSelect.value = columns;
    updateGalleryLayout(columns);
});

function updateGalleryLayout(columns) {
    gallery.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    deselectImage();
}

async function fetchImages() {
    try {
        const response = await fetch(`https://pixabay.com/api/?key=${apiKey}&page=${page}&per_page=20`);
        const data = await response.json();
        return data.hits;
    } catch (error) {
        console.error('Error fetching images:', error);
        return [];
    }
}

function displayImages(images) {
    images.forEach((image, index) => {
        const imgElement = document.createElement('img');
        imgElement.dataset.src = image.webformatURL;
        imgElement.classList.add('lazy');
        const imageBox = document.createElement('div');
        imageBox.classList.add('image-box');
        imageBox.appendChild(imgElement);
        imageBox.addEventListener('click', () => selectImage(index));
        
        // Add download button
        const downloadButton = document.createElement('button');
        downloadButton.textContent = 'Download';
        downloadButton.classList.add('download-button');
        downloadButton.addEventListener('click', (event) => {
            event.stopPropagation();
            downloadImage(image.largeImageURL);
        });
        imageBox.appendChild(downloadButton);
        
        gallery.appendChild(imageBox);
    });
    lazyLoadImages();
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
    const config = {
        rootMargin: '0px 0px 200px 0px',
        threshold: 0
    };

    const observer = new IntersectionObserver((entries, self) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                img.classList.add('lazy-loaded');
                self.unobserve(img);
            }
        });
    }, config);

    lazyImages.forEach(image => {
        observer.observe(image);
    });
}

async function loadImages() {
    spinner.style.display = 'block';
    const images = await fetchImages();
    displayImages(images);
    spinner.style.display = 'none';
    page++;
}

window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        loadImages();
    }
});

loadImages();

gallery.style.gridTemplateColumns = `repeat(${imageCountSelect.value}, 1fr)`;

function selectImage(index) {
    const imageBoxes = document.querySelectorAll('.image-box');
    if (selectedIndex >= 0) {
        imageBoxes[selectedIndex].classList.remove('selected');
    }
    imageBoxes[index].classList.add('selected');
    imageBoxes[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    selectedIndex = index;
}

function deselectImage() {
    const imageBoxes = document.querySelectorAll('.image-box');
    if (selectedIndex >= 0) {
        imageBoxes[selectedIndex].classList.remove('selected');
        selectedIndex = -1;
    }
}

document.addEventListener('keydown', (event) => {
    const key = event.key;
    const imageBoxes = document.querySelectorAll('.image-box');
    const columns = parseInt(imageCountSelect.value);
    const totalImages = imageBoxes.length;

    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'ArrowLeft' || key === 'ArrowRight') {
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
    }
});

document.addEventListener('click', (event) => {
    if (!gallery.contains(event.target)) {
        deselectImage();
    }
});

applyTheme();
