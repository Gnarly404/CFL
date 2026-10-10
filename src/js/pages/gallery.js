// gallery.js
// Scroll reveals, the hero parallax, the count-up statistics and the brochure tilt now come from the shared
// motion engine (src/js/motion) through data attributes in gallery.html.

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize all components
    initializeGallery();
    initializeBrochure();
    initializeSmoothScroll();
    initializeBackButton();
});

// ====== Gallery Functions ======
function initializeGallery() {
    const galleryItems = document.querySelectorAll('.gallery-item');
    
    galleryItems.forEach(item => {
        // Enhanced hover effects
        item.addEventListener('mouseenter', () => {
            item.style.zIndex = '1';
        });

        item.addEventListener('mouseleave', () => {
            item.style.zIndex = '0';
        });
    });
}

// ====== Brochure Section Functions ======
function initializeBrochure() {
    const downloadButtons = document.querySelectorAll('.btn-download');
    
    // Initialize download buttons
    downloadButtons.forEach(button => {
        button.addEventListener('click', handleDownload);
    });
}

function handleDownload(e) {
    const button = e.currentTarget;
    const fileType = button.dataset.file;
    const isDigital = button.classList.contains('digital');
    
    // Add loading state
    button.classList.add('loading');
    
    // Simulate download/view process
    setTimeout(() => {
        if (isDigital) {
            window.open('digital-brochure.html', '_blank');
        } else {
            // Handle PDF download
            const link = document.createElement('a');
            link.href = fileType;
            link.download = fileType;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        
        // Remove loading state
        button.classList.remove('loading');
        
        // Track download/view event
        trackBrochureAction(isDigital ? 'view' : 'download');
    }, 800);
}

// ====== Back Button Functions ======
function initializeBackButton() {
    const backButton = document.querySelector('.back-button');
    if (backButton) {
        backButton.addEventListener('click', (e) => {
            e.preventDefault();
            window.history.back();
        });
    }
}

function initializeSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

function trackBrochureAction(_action) {
    // Analytics hook: wired up in the hardening session.
}