// gallery.js

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize all components
    initializeObservers();
    initializeGallery();
    initializeHeroInteractions();
    initializeBrochure();
    initializeSmoothScroll();
    initializeBackButton();
});

// ====== Intersection Observer Setup ======
function initializeObservers() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (entry.target.classList.contains('stat-number')) {
                    handleStatAnimation(entry.target);
                } else {
                    entry.target.classList.add('fade-in');
                }
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.3
    });

    // Observe sections for fade-in
    document.querySelectorAll('section').forEach(section => {
        observer.observe(section);
    });

    // Observe stats for number animation
    document.querySelectorAll('.stat-number').forEach(stat => {
        observer.observe(stat);
    });
}

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

// ====== Hero Section Functions ======
function initializeHeroInteractions() {
    // Parallax effect for hero background
    const heroSection = document.querySelector('.hero-section');
    window.addEventListener('scroll', () => {
        const scroll = window.pageYOffset;
        if (heroSection) {
            requestAnimationFrame(() => {
                heroSection.style.backgroundPositionY = `${scroll * 0.5}px`;
            });
        }
    });
    
    // Initialize feature items animation
    initializeFeatures();
}

function initializeFeatures() {
    const features = document.querySelectorAll('.feature-item');
    features.forEach((feature, index) => {
        feature.style.opacity = '0';
        feature.style.transform = 'translateX(-20px)';
        
        setTimeout(() => {
            feature.style.transition = 'all 0.5s ease';
            feature.style.opacity = '1';
            feature.style.transform = 'translateX(0)';
        }, 300 + (index * 100));
    });
}

// ====== Brochure Section Functions ======
function initializeBrochure() {
    const downloadButtons = document.querySelectorAll('.btn-download');
    const previewCard = document.querySelector('.preview-card');
    
    // Initialize download buttons
    downloadButtons.forEach(button => {
        button.addEventListener('click', handleDownload);
    });
    
    // Initialize preview card interactions
    if (previewCard) {
        initializePreviewCard(previewCard);
    }
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

function initializePreviewCard(previewCard) {
    let initialRotation = { x: 0, y: 0 };
    let targetRotation = { x: 0, y: 0 };
    let isHovered = false;

    previewCard.addEventListener('mouseenter', () => {
        isHovered = true;
    });

    previewCard.addEventListener('mouseleave', () => {
        isHovered = false;
        targetRotation = { x: 0, y: 0 };
        animateCardRotation();
    });

    previewCard.addEventListener('mousemove', (e) => {
        if (!isHovered) return;

        const rect = previewCard.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        targetRotation = {
            x: ((mouseY - centerY) / centerY) * 10,
            y: ((mouseX - centerX) / centerX) * 10
        };

        animateCardRotation();
    });

    function animateCardRotation() {
        if (!isHovered) {
            initialRotation.x += (targetRotation.x - initialRotation.x) * 0.1;
            initialRotation.y += (targetRotation.y - initialRotation.y) * 0.1;
        } else {
            initialRotation = targetRotation;
        }

        requestAnimationFrame(() => {
            previewCard.style.transform = `
                rotateX(${-initialRotation.x}deg) 
                rotateY(${initialRotation.y}deg)
            `;
        });

        if (isHovered || Math.abs(initialRotation.x) > 0.01 || Math.abs(initialRotation.y) > 0.01) {
            requestAnimationFrame(animateCardRotation);
        }
    }
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

// ====== Utility Functions ======
function handleStatAnimation(element) {
    const value = element.textContent;
    const numeric = parseInt(value);
    if (!isNaN(numeric)) {
        animateValue(element, 0, numeric, 2000);
    }
}

function animateValue(element, start, end, duration) {
    const range = end - start;
    let current = start;
    let startTime;
    
    function updateValue(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = timestamp - startTime;
        
        current = start + (progress / duration) * range;
        
        if (current >= end) {
            element.textContent = Math.floor(end) + '+';
            return;
        }
        
        element.textContent = Math.floor(current) + '+';
        requestAnimationFrame(updateValue);
    }
    
    requestAnimationFrame(updateValue);
}

function initializeSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

function trackBrochureAction(_action) {
    // Analytics hook: wired up in the hardening session.
}