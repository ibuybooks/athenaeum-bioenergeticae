(function() {
    'use strict';

    // State
    let allEntries = [];
    let filteredEntries = [];
    let displayedCount = 0;
    const ENTRIES_PER_PAGE = 30;

    // DOM Elements
    const searchInput = document.getElementById('search-input');
    const typeFilters = document.getElementById('type-filters');
    const sectionFilter = document.getElementById('section-filter');
    const sourceFilter = document.getElementById('source-filter');
    const resetButton = document.getElementById('reset-filters');
    const entriesList = document.getElementById('entries-list');
    const loadMoreContainer = document.getElementById('load-more-container');
    const loadMoreButton = document.getElementById('load-more');
    const showingCount = document.getElementById('showing-count');
    const totalCount = document.getElementById('total-count');
    const modal = document.getElementById('entry-modal');
    const modalBody = modal.querySelector('.modal-body');
    const modalClose = modal.querySelector('.modal-close');
    const modalOverlay = modal.querySelector('.modal-overlay');

    // Initialize
    async function init() {
        try {
            const response = await fetch('email-exchanges.json');
            const data = await response.json();
            allEntries = data.entries;

            // Update counts
            document.querySelector('[data-type="qaexchange"]').textContent = data.stats.qaexchange;
            document.querySelector('[data-type="standalonequote"]').textContent = data.stats.standalonequote;
            document.querySelector('[data-type="emailexchange"]').textContent = data.stats.emailexchange;
            totalCount.textContent = data.stats.total;

            // Populate filters
            populateSelect(sectionFilter, data.sections.sort());
            populateSelect(sourceFilter, data.sources.sort());

            // Apply initial filter
            applyFilters();

            // Setup event listeners
            setupEventListeners();

            // Check URL for entry ID
            checkUrlForEntry();
        } catch (error) {
            console.error('Failed to load data:', error);
            entriesList.innerHTML = '<div class="no-results"><div class="no-results-icon">!</div><p class="no-results-text">Failed to load data. Please try refreshing the page.</p></div>';
        }
    }

    function populateSelect(select, options) {
        const defaultOption = select.options[0];
        select.innerHTML = '';
        select.appendChild(defaultOption);

        options.filter(Boolean).forEach(option => {
            const opt = document.createElement('option');
            opt.value = option;
            opt.textContent = option;
            select.appendChild(opt);
        });
    }

    function setupEventListeners() {
        // Search with debounce
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(applyFilters, 200);
        });

        // Type filters
        typeFilters.addEventListener('change', applyFilters);

        // Select filters
        sectionFilter.addEventListener('change', applyFilters);
        sourceFilter.addEventListener('change', applyFilters);

        // Reset button
        resetButton.addEventListener('click', resetFilters);

        // Load more
        loadMoreButton.addEventListener('click', loadMore);

        // Modal
        modalClose.addEventListener('click', closeModal);
        modalOverlay.addEventListener('click', closeModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });

        // Handle URL changes
        window.addEventListener('popstate', checkUrlForEntry);
    }

    function getActiveTypes() {
        const checkboxes = typeFilters.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    const parser = new DOMParser();

    function stripHtml(html) {
        if (!html) return '';
        const doc = parser.parseFromString(html, 'text/html');
        return doc.body.textContent || '';
    }

    function applyFilters() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const activeTypes = getActiveTypes();
        const selectedSection = sectionFilter.value;
        const selectedSource = sourceFilter.value;

        filteredEntries = allEntries.filter(entry => {
            // Type filter
            if (!activeTypes.includes(entry.type)) return false;

            // Section filter
            if (selectedSection && entry.section !== selectedSection) return false;

            // Source filter
            if (selectedSource && entry.source !== selectedSource) return false;

            // Search filter
            if (searchTerm) {
                const searchableText = [
                    entry.topic,
                    entry.category,
                    entry.source,
                    ...entry.content.map(c => (c.question || '') + ' ' + c.answer)
                ].map(text => stripHtml(text || '')).join(' ').toLowerCase();

                return searchableText.includes(searchTerm);
            }

            return true;
        });

        // Reset display
        displayedCount = 0;
        entriesList.innerHTML = '';

        // Render first batch
        renderEntries();

        // Update showing count
        updateCounts();
    }

    function renderEntries() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        const entriesToRender = filteredEntries.slice(displayedCount, displayedCount + ENTRIES_PER_PAGE);

        if (displayedCount === 0 && entriesToRender.length === 0) {
            entriesList.innerHTML = `
                <div class="no-results">
                    <div class="no-results-icon">?</div>
                    <p class="no-results-text">No entries match your filters. Try adjusting your search or filters.</p>
                </div>
            `;
            loadMoreContainer.classList.remove('visible');
            return;
        }

        entriesToRender.forEach(entry => {
            const card = createEntryCard(entry, searchTerm);
            entriesList.appendChild(card);
        });

        displayedCount += entriesToRender.length;

        // Update load more visibility
        if (displayedCount < filteredEntries.length) {
            loadMoreContainer.classList.add('visible');
        } else {
            loadMoreContainer.classList.remove('visible');
        }
    }

    function createEntryCard(entry, searchTerm) {
        const card = document.createElement('article');
        card.className = 'entry-card';
        card.dataset.id = entry.id;

        const typeLabels = {
            qaexchange: 'Q&A',
            standalonequote: 'Quote',
            emailexchange: 'Email'
        };

        // Get first Q&A pair for preview
        const firstContent = entry.content[0] || {};
        let bodyHtml = '';

        if (entry.type === 'standalonequote') {
            bodyHtml = `<div class="entry-quote">${highlightText(firstContent.answer || '', searchTerm)}</div>`;
        } else {
            if (firstContent.question) {
                bodyHtml += `<div class="entry-question">${highlightText(firstContent.question, searchTerm)}</div>`;
            }
            if (firstContent.answer) {
                bodyHtml += `<div class="entry-answer">${highlightText(firstContent.answer, searchTerm)}</div>`;
            }
        }

        card.innerHTML = `
            <header class="entry-header">
                <span class="entry-type-badge ${entry.type}">${typeLabels[entry.type]}</span>
                <span class="entry-topic">${highlightText(entry.topic || 'Untitled', searchTerm)}</span>
            </header>
            <div class="entry-body">
                ${bodyHtml}
            </div>
            <footer class="entry-meta">
                ${entry.section ? `<span class="entry-meta-tag">Topic: ${entry.section}</span>` : ''}
                ${entry.content.length > 1 ? `<span class="entry-meta-tag">${entry.content.length} items</span>` : ''}
            </footer>
        `;

        card.addEventListener('click', () => openModal(entry));

        return card;
    }

    function truncate(text, maxLength) {
        if (!text || text.length <= maxLength) return text || '';
        return text.substring(0, maxLength).trim() + '...';
    }

    function highlightText(text, searchTerm) {
        if (!searchTerm || !text) return text || '';
        
        // SAFETY: Limit highlight length to prevent regex browser crashes
        if (searchTerm.length > 50) return text; 

        try {
            // Create a pattern that allows HTML tags between characters
            const escapedTerm = escapeRegex(searchTerm);
            const chars = escapedTerm.split('');
            const pattern = chars.map(char => `${char}(?:<[^>]*>)*`).join('');
            const regex = new RegExp(`(${pattern})`, 'gi');

            return text.replace(regex, '<span class="highlight">$1</span>');
        } catch (e) {
            // Fallback if regex fails
            return text;
        }
    }

    function escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function loadMore() {
        renderEntries();
        updateCounts();
    }

    function updateCounts() {
        showingCount.textContent = Math.min(displayedCount, filteredEntries.length);
    }

    function resetFilters() {
        searchInput.value = '';
        typeFilters.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        sectionFilter.value = '';
        sourceFilter.value = '';
        applyFilters();
    }

    function openModal(entry) {
        const typeLabels = {
            qaexchange: 'Q&A Exchange',
            standalonequote: 'Quote',
            emailexchange: 'Email Exchange'
        };

        let contentHtml = '';

        if (entry.type === 'standalonequote') {
            const content = entry.content[0] || {};
            contentHtml = `
                <div class="modal-quote-text">${content.answer || ''}</div>
                <p style="margin-top: 16px; text-align: right; font-style: italic; color: var(--color-ink-faded); font-size: 15px;">— Ray Peat</p>
            `;
        } else {
            contentHtml = entry.content.map((item, index) => `
                <div class="modal-qa-item">
                    ${item.question ? `
                        <div class="modal-question">
                            <span class="modal-question-label">Question${entry.content.length > 1 ? ` ${index + 1}` : ''}</span>
                            ${item.question}
                        </div>
                    ` : ''}
                    <div class="modal-answer">
                        <span class="modal-answer-label">Answer</span>
                        ${item.answer}
                    </div>
                </div>
            `).join('');
            contentHtml += `<p style="margin-top: 24px; text-align: right; font-style: italic; color: var(--color-ink-faded); font-size: 15px;">— Ray Peat</p>`;
        }

        modalBody.innerHTML = `
            <div class="modal-header">
                <span class="modal-type ${entry.type}">${typeLabels[entry.type]}</span>
                <h2 class="modal-topic">${entry.topic || 'Untitled'}</h2>
                <div class="modal-meta">
                    ${entry.section ? `<span>Topic: ${entry.section}</span>` : ''}
                    ${entry.source ? `<span>Source: ${entry.source}</span>` : ''}
                </div>
            </div>
            ${contentHtml}
            <div class="modal-share">
                <button class="share-button" id="copy-link">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                    Share
                </button>
                <button class="share-button" id="copy-text">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    Copy Text
                </button>
            </div>
        `;

        // Setup share buttons
        document.getElementById('copy-link').addEventListener('click', () => copyLink(entry));
        document.getElementById('copy-text').addEventListener('click', () => copyText(entry));

        // Update URL
        history.pushState({ entryId: entry.id }, '', `?entry=${entry.id}`);

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        history.pushState(null, '', window.location.pathname);
    }

    function copyLink(entry) {
        const url = `${window.location.origin}${window.location.pathname}?entry=${entry.id}`;
        copyToClipboard(url, 'copy-link');
    }

    function copyText(entry) {
        let text = '';

        if (entry.topic) {
            text += `Topic: ${entry.topic}\n\n`;
        }

        entry.content.forEach((item, i) => {
            if (item.question) {
                text += `Q: ${item.question}\n\n`;
            }
            text += `A: ${item.answer}\n`;
            if (i < entry.content.length - 1) text += '\n---\n\n';
        });

        if (entry.source) {
            text += `\nSource: ${entry.source}`;
        }

        copyToClipboard(text, 'copy-text');
    }

    async function copyToClipboard(text, buttonId) {
        try {
            await navigator.clipboard.writeText(text);
            const button = document.getElementById(buttonId);
            button.classList.add('copied');
            const originalText = button.innerHTML;
            button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!';
            setTimeout(() => {
                button.classList.remove('copied');
                button.innerHTML = originalText;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }

    function checkUrlForEntry() {
        const params = new URLSearchParams(window.location.search);
        const entryId = params.get('entry');

        if (entryId !== null) {
            const entry = allEntries.find(e => e.id === parseInt(entryId));
            if (entry) {
                openModal(entry);
            }
        }
    }

    // Check for search parameter from URL (from home page search)
    function checkUrlSearch() {
        const params = new URLSearchParams(window.location.search);
        const searchQuery = params.get('search');
        if (searchQuery) {
            searchInput.value = searchQuery;
        }
    }

    // Start the app
    document.addEventListener('DOMContentLoaded', () => {
        checkUrlSearch();
        init();
    });
})();
