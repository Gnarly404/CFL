// Quiz data structure
const quizData = [
    {
        question: "What does the word 'ubiquitous' mean?",
        options: [
            { text: "Rare", correct: false },
            { text: "Present everywhere", correct: true },
            { text: "Hidden", correct: false },
            { text: "Obsolete", correct: false }
        ]
    },
    {
        question: "Which word means 'to make something better'?",
        options: [
            { text: "Deteriorate", correct: false },
            { text: "Enhance", correct: true },
            { text: "Maintain", correct: false },
            { text: "Ignore", correct: false }
        ]
    },
    {
        question: "What is a synonym for 'quick'?",
        options: [
            { text: "Slow", correct: false },
            { text: "Rapid", correct: true },
            { text: "Sluggish", correct: false },
            { text: "Idle", correct: false }
        ]
    },
    {
        question: "Choose the antonym of 'optimistic'.",
        options: [
            { text: "Hopeful", correct: false },
            { text: "Positive", correct: false },
            { text: "Pessimistic", correct: true },
            { text: "Cheerful", correct: false }
        ]
    },
    {
        question: "What does 'inevitable' mean?",
        options: [
            { text: "Avoidable", correct: false },
            { text: "Unavoidable", correct: true },
            { text: "Questionable", correct: false },
            { text: "Predictable", correct: false }
        ]
    },
    {
        question: "Which word is a synonym for 'fastidious'?",
        options: [
            { text: "Easygoing", correct: false },
            { text: "Meticulous", correct: true },
            { text: "Careless", correct: false },
            { text: "Impatient", correct: false }
        ]
    }
    // Add more questions as needed
];

// Quiz Functionality
document.addEventListener("DOMContentLoaded", function () {
    const quizContent = document.querySelector(".quiz-content");
    if (quizContent) {
        let currentQuestion = 0;
        const questionElement = quizContent.querySelector(".question");
        const optionsElement = quizContent.querySelector(".options");
        const feedbackElement = quizContent.querySelector(".quiz-feedback");
        const nextButton = quizContent.querySelector(".next-question");

        function loadQuestion(index) {
            const question = quizData[index];
            questionElement.textContent = question.question;
            optionsElement.innerHTML = "";
            question.options.forEach((option) => {
                const li = document.createElement("li");
                li.textContent = option.text;
                li.classList.add("quiz-option");
                li.dataset.correct = option.correct;
                optionsElement.appendChild(li);
            });
            feedbackElement.textContent = "";
        }

        optionsElement.addEventListener("click", (e) => {
            if (e.target.tagName === "LI") {
                const isCorrect = e.target.dataset.correct === "true";
                feedbackElement.textContent = isCorrect ? "Correct!" : "Wrong Answer!";
                feedbackElement.style.color = isCorrect ? "green" : "red";
            }
        });

        nextButton.addEventListener("click", () => {
            currentQuestion = (currentQuestion + 1) % quizData.length;
            loadQuestion(currentQuestion);
        });

        loadQuestion(currentQuestion);
    }
});
// DOM Elements
document.addEventListener('DOMContentLoaded', function() {
    // Modal elements
    const modals = {
        beginner1: document.getElementById('beginner1Modal'),
        beginner2: document.getElementById('beginner2Modal'),
        intermediate: document.getElementById('intermediateModal'),
        advanced: document.getElementById('advancedModal'),
        intake: document.getElementById('intakeModal')
    };

    // Program cards data
    const programsData = [
        {
            id: 'beginner1',
            title: 'English Language Programme (Elementary-Beginner 1)',
            duration: '4 Months',
            maxStudents: '15 Students Max',
            features: 'IELTS/TOEFL Prep',
            seatsLeft: 3,
            progress: 75,
            isPopular: true
        },
        {
            id: 'beginner2',
            title: 'English Language Programme (Elementary-Beginner 2)',
            duration: '4 Months',
            maxStudents: '15 Students Max',
            features: 'IELTS/TOEFL Prep',
            seatsLeft: 3,
            progress: 75,
            isPopular: true
        },
        {
            id: 'intermediate',
            title: 'English Language Programme (Intermediate)',
            duration: '4 Months',
            maxStudents: '15 Students Max',
            features: 'IELTS/TOEFL Prep',
            seatsLeft: 3,
            progress: 75,
            isPopular: true
        },
        {
            id: 'advanced',
            title: 'English Language Programme (Advanced)',
            duration: '4 Months',
            maxStudents: '15 Students Max',
            features: 'IELTS/TOEFL Prep',
            seatsLeft: 3,
            progress: 75,
            isPopular: true
        },
        {
            id: 'intake',
            title: 'English Language Programme (Intake)',
            duration: '2 Months',
            maxStudents: '15 Students Max',
            features: 'IELTS/TOEFL Prep',
            seatsLeft: 3,
            progress: 75,
            isPopular: true
        }
    ];

    // Initialize program cards
    const programsContainer = document.querySelector('.programs-container');
    initializeProgramCards();

    // Filter functionality
    const filterInputs = document.querySelectorAll('.checkbox-group input[type="checkbox"]');
    filterInputs.forEach(input => {
        input.addEventListener('change', filterPrograms);
    });

    // Search functionality
    const searchInput = document.querySelector('#programSearch');
    const suggestionBox = document.createElement('div');
    suggestionBox.className = 'suggestion-box';
    searchInput.parentNode.appendChild(suggestionBox);

    function debounce(func, delay) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), delay);
        };
    }

    const debouncedSearch = debounce(filterPrograms, 300);
    searchInput.addEventListener('input', debouncedSearch);

    // Quick filters
    const quickFilters = document.querySelectorAll('.quick-filters .filter-pill');
    quickFilters.forEach(filter => {
        filter.addEventListener('click', () => {
            quickFilters.forEach(f => f.classList.remove('active'));
            filter.classList.add('active');
            filterPrograms();
        });
    });

    // Price range slider
    const priceSlider = document.querySelector('.range-slider input[type="range"]');
    if (priceSlider) {
        priceSlider.addEventListener('input', filterPrograms);
    }

    // Functions
    function initializeProgramCards() {
        programsContainer.innerHTML = '';
        programsData.forEach(program => {
            const card = createProgramCard(program);
            programsContainer.appendChild(card);
        });
    }

    function createProgramCard(program) {
        const card = document.createElement('div');
        card.className = 'program-card';
        
        // Create card HTML structure
        card.innerHTML = `
            <div class="card-header">
                <i class="fas fa-graduation-cap program-icon"></i>
                <h3>${program.title}</h3>
            </div>
            <div class="card-body">
                <div class="program-details">
                    <div class="detail-item">
                        <i class="fas fa-clock"></i> ${program.duration}
                    </div>
                    <div class="detail-item">
                        <i class="fas fa-users"></i> ${program.maxStudents}
                    </div>
                    <div class="detail-item">
                        <i class="fas fa-certificate"></i> ${program.features}
                    </div>
                </div>
                <div class="program-progress">
                    <div class="progress-bar">
                        <div class="progress" style="width: ${program.progress}%"></div>
                    </div>
                    <span class="seats-left"><i class="fas fa-chair"></i> ${program.seatsLeft} seats left</span>
                </div>
            </div>
            <div class="card-footer">
                <button class="compare-toggle"><i class="fas fa-balance-scale"></i> Add to Compare</button>
                <button class="view-details" data-program="${program.id}"><i class="fas fa-arrow-right"></i> View Details</button>
            </div>
        `;

        // Add event listeners
        const viewDetailsBtn = card.querySelector('.view-details');
        viewDetailsBtn.addEventListener('click', () => {
            showModal(program.id);
        });

        const compareBtn = card.querySelector('.compare-toggle');
        compareBtn.addEventListener('click', () => {
            toggleCompare(program.id);
        });

        return card;
    }

    function showModal(programId) {
        // Hide all modals
        Object.values(modals).forEach(modal => {
            modal.style.display = 'none';
            modal.classList.remove('active');
        });

        // Show selected modal
        const modal = modals[programId];
        if (modal) {
            modal.style.display = 'block';
            modal.classList.add('active');

            // Close button functionality
            modal.querySelectorAll('[data-bs-dismiss="modal"]').forEach(button => {
                button.addEventListener('click', () => {
                    modal.style.display = 'none';
                    modal.classList.remove('active');
                });
            });

            // Close modal on outside click
            window.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                    modal.classList.remove('active');
                }
            });

            trapFocus(modal);
        }
    }

    // Comparison functionality
    const selectedPrograms = new Set();
    const comparisonBar = document.querySelector('.comparison-bar');

    function toggleCompare(programId) {
        if (selectedPrograms.has(programId)) {
            selectedPrograms.delete(programId);
        } else {
            if (selectedPrograms.size < 3) {
                selectedPrograms.add(programId);
            } else {
                alert('You can compare up to 3 programs at a time');
                return;
            }
        }
        updateComparisonBar();
    }

    function updateComparisonBar() {
        if (selectedPrograms.size > 0) {
            comparisonBar.style.display = 'flex';
            const selectedProgramsContainer = comparisonBar.querySelector('.selected-programs');
            selectedProgramsContainer.innerHTML = Array.from(selectedPrograms)
                .map(id => {
                    const program = programsData.find(p => p.id === id);
                    return `<div class="selected-program">
                        <span>${program.title}</span>
                        <button onclick="removeFromComparison('${id}')">×</button>
                    </div>`;
                })
                .join('');
        } else {
            comparisonBar.style.display = 'none';
        }
    }

    // Filter programs
    function filterPrograms() {
        const searchTerm = document.querySelector('.search-box input')?.value.toLowerCase() || '';
        const selectedLevel = document.querySelector('.quick-filters .filter-pill.active')?.textContent.toLowerCase() || 'all levels';
        const selectedDurations = Array.from(document.querySelectorAll('.filter-group:nth-child(1) input:checked')).map(input => input.value);

        const filteredPrograms = programsData.filter(program => {
            const matchesSearch = program.title.toLowerCase().includes(searchTerm);
            const matchesLevel = selectedLevel === 'all levels' || program.title.toLowerCase().includes(selectedLevel);
            const matchesDuration = selectedDurations.length === 0 || selectedDurations.includes(program.duration);
            // Add more filtering conditions as needed

            return matchesSearch && matchesLevel && matchesDuration;
        });

        // Update display
        programsContainer.innerHTML = '';
        filteredPrograms.forEach(program => {
            const card = createProgramCard(program);
            programsContainer.appendChild(card);
        });
    }

    // Load more functionality
    const loadMoreBtn = document.querySelector('.load-more');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            // Implement load more logic here
            // This could fetch more programs from an API or show hidden programs
        });
    }
    document.addEventListener('DOMContentLoaded', () => {
        const faqItems = document.querySelectorAll('.faq-item');
    
        faqItems.forEach(item => {
            const questionButton = item.querySelector('.faq-question');
    
            questionButton.addEventListener('click', () => {
                const isExpanded = questionButton.getAttribute('aria-expanded') === 'true';
    
                // Close all other FAQ items
                faqItems.forEach(otherItem => {
                    const otherButton = otherItem.querySelector('.faq-question');
                    otherButton.setAttribute('aria-expanded', 'false');
                    otherItem.classList.remove('active');
                });
    
                // Toggle current item
                questionButton.setAttribute('aria-expanded', !isExpanded);
                item.classList.toggle('active', !isExpanded);
            });
        });
    });
    
    function trapFocus(modal) {
        const focusableElements = modal.querySelectorAll('button, [href], input, select, textarea');
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                if (e.shiftKey && document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement.focus();
                } else if (!e.shiftKey && document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement.focus();
                }
            }
        });
        firstElement.focus();
    }
});
