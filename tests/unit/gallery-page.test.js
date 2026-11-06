// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ images: [] }));

vi.mock('@/services/gallery-service.js', () => ({
  loadGalleryImages: vi.fn(async () => state.images.map((image) => ({ ...image }))),
}));
vi.mock('@/services/firebase-storage.js', () => ({ storageService: () => ({}) }));
vi.mock('firebase/storage', () => ({
  ref: (_storage, path) => ({ path }),
  getDownloadURL: vi.fn(async (imageRef) => `https://storage.test/${imageRef.path}`),
}));

import '@/pages/gallery.js';

describe('public gallery page', () => {
  beforeEach(() => {
    state.images = [
      { id: 'second', title: 'Second photo', caption: 'A new caption', category: 'students', src: null, path: 'public/gallery/second' },
      { id: 'first', title: 'First photo', caption: 'First caption', category: 'facilities', src: '/images/first.jpg', path: null },
    ];
    document.body.innerHTML = '<div class="gallery-grid"><div class="gallery-item">Original</div></div>';
  });

  it('renders the saved order, captions, and public image URLs', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await vi.waitFor(() => expect(document.querySelectorAll('.gallery-grid .gallery-item')).toHaveLength(2));

    const cards = document.querySelectorAll('.gallery-grid .gallery-item');
    expect(cards[0].querySelector('h3').textContent).toBe('Second photo');
    expect(cards[0].querySelector('p').textContent).toBe('A new caption');
    expect(cards[0].querySelector('img').src).toBe('https://storage.test/public/gallery/second');
    expect(cards[1].querySelector('img').getAttribute('src')).toBe('/images/first.jpg');
    expect(cards[0].classList.contains('large')).toBe(true);
  });
});
