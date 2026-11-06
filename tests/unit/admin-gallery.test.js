// @vitest-environment jsdom
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';

const state = vi.hoisted(() => ({ urls: new Map(), uploads: [], deletions: [], images: [], failNextUpload: false }));

vi.mock('firebase/storage', () => ({
  ref: (_storage, path) => ({ path }),
  uploadBytesResumable: vi.fn((imageRef, file) => {
    const snapshot = { bytesTransferred: file.size, totalBytes: file.size };
    const task = {
      snapshot,
      on: (_event, progress, failure, complete) => {
        state.uploads.push({ path: imageRef.path, file });
        queueMicrotask(() => {
          if (state.failNextUpload) {
            state.failNextUpload = false;
            failure(Object.assign(new Error('retry limit'), { code: 'storage/retry-limit-exceeded' }));
            return;
          }
          progress(snapshot);
          state.urls.set(imageRef.path, `https://storage.test/${file.name}`);
          complete();
        });
      },
    };
    return task;
  }),
  getDownloadURL: vi.fn(async (imageRef) => {
    const url = state.urls.get(imageRef.path);
    if (!url) throw Object.assign(new Error('not found'), { code: 'storage/object-not-found' });
    return url;
  }),
  deleteObject: vi.fn(async (imageRef) => {
    state.deletions.push(imageRef.path);
    state.urls.delete(imageRef.path);
  }),
}));

vi.mock('@/services/firebase-storage.js', () => ({ storageService: () => ({}) }));
vi.mock('@/services/gallery-service.js', () => ({
  loadGalleryImages: vi.fn(async () => state.images.map((image) => ({ ...image }))),
  saveGalleryImages: vi.fn(async (images) => {
    const paths = new Set(images.map((image) => image.path).filter(Boolean));
    const retired = state.images.map((image) => image.path).filter((path) => path && !paths.has(path));
    state.images = images.map((image) => ({ ...image }));
    return retired;
  }),
}));

import { initGalleryAdmin } from '@/admin/gallery.js';
import { GALLERY_IMAGES } from '@/gallery/gallery-images.js';

const waitForLoaded = async () => {
  await vi.waitFor(() => expect(document.querySelector('.gallery-admin-manager').disabled).toBe(false));
};
const selectFile = (input, file) => {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
};
const save = async () => {
  document.querySelector('.gallery-image-toolbar .btn-primary').click();
  await vi.waitFor(() => expect(document.querySelector('#galleryStatus').textContent).toMatch(/saved/i));
};

describe('admin gallery manager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    state.urls.clear();
    state.uploads.length = 0;
    state.deletions.length = 0;
    state.failNextUpload = false;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => `blob:test/${file.name}`);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    state.images = GALLERY_IMAGES.map((image, position) => ({ ...image, position, path: null }));
    document.body.innerHTML = '<p id="galleryStatus" role="status"></p><div id="galleryImages"></div>';
    window.confirm = () => true;
    initGalleryAdmin();
    await waitForLoaded();
  });

  it('lets admins edit titles and captions, reorder images, and save', async () => {
    let cards = document.querySelectorAll('.gallery-image-card');
    expect(cards).toHaveLength(6);

    const title = cards[0].querySelector('input[type="text"]');
    title.value = 'New Welcome';
    title.dispatchEvent(new Event('input'));
    const caption = cards[0].querySelector('textarea');
    caption.value = 'New caption';
    caption.dispatchEvent(new Event('input'));
    cards[0].querySelectorAll('button')[1].click();
    cards = document.querySelectorAll('.gallery-image-card');
    expect(cards[1].querySelector('input[type="text"]').value).toBe('New Welcome');

    await save();
    expect(state.images[1]).toMatchObject({ title: 'New Welcome', caption: 'New caption' });
  });

  it('adds and uploads a new image', async () => {
    document.querySelector('#newGalleryTitle').value = 'New class';
    document.querySelector('#newGalleryCaption').value = 'Students learning together';
    selectFile(
      document.querySelector('#newGalleryFile'),
      new File(['image'], 'new-class.jpg', { type: 'image/jpeg' }),
    );
    document.querySelector('.gallery-image-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(document.querySelectorAll('.gallery-image-card')).toHaveLength(7);
    expect(document.querySelectorAll('.gallery-image-card')[6].querySelector('img').src).toBe('blob:test/new-class.jpg');
    await save();
    expect(state.images).toHaveLength(7);
    expect(state.images[6]).toMatchObject({ title: 'New class', caption: 'Students learning together' });
    expect(state.images[6].path).toMatch(/^public\/gallery\//);
    expect(state.uploads[0].file.name).toBe('new-class.jpg');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/new-class.jpg');
  });

  it('resizes and compresses a large image before uploading', async () => {
    const bitmap = { width: 4000, height: 3000, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function toBlob(callback, type) {
      expect(this.width).toBe(2000);
      expect(this.height).toBe(1500);
      callback(new Blob([new Uint8Array(1.5 * 1024 * 1024)], { type }));
    });

    document.querySelector('#newGalleryTitle').value = 'Large image';
    document.querySelector('#newGalleryCaption').value = 'Prepared for upload';
    selectFile(
      document.querySelector('#newGalleryFile'),
      new File([new Uint8Array(5 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' }),
    );
    document.querySelector('.gallery-image-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await save();

    expect(state.uploads[0].file.size).toBe(1.5 * 1024 * 1024);
    expect(state.uploads[0].file.type).toBe('image/jpeg');
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('previews a replacement image immediately', () => {
    const card = document.querySelectorAll('.gallery-image-card')[0];
    selectFile(card.querySelector('input[type="file"]'), new File(['image'], 'replacement.png', { type: 'image/png' }));
    expect(card.querySelector('img').src).toBe('blob:test/replacement.png');
  });

  it('deletes an image and rejects unsupported formats', async () => {
    const file = new File(['image'], 'unsupported.gif', { type: 'image/gif' });
    selectFile(document.querySelector('#newGalleryFile'), file);
    document.querySelector('.gallery-image-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(document.querySelectorAll('.gallery-image-card')).toHaveLength(6);
    expect(document.querySelector('#galleryStatus').textContent).toContain('JPEG, PNG or WebP');

    document.querySelectorAll('.gallery-image-card')[0].querySelector('.btn-outline-danger').click();
    expect(document.querySelectorAll('.gallery-image-card')).toHaveLength(5);
    await save();
    expect(state.images).toHaveLength(5);
  });

  it('keeps edits available after a retry-limit upload error', async () => {
    state.failNextUpload = true;
    document.querySelector('#newGalleryTitle').value = 'Retry me';
    document.querySelector('#newGalleryCaption').value = 'Connection interruption';
    selectFile(
      document.querySelector('#newGalleryFile'),
      new File(['image'], 'retry.jpg', { type: 'image/jpeg' }),
    );
    document.querySelector('.gallery-image-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    document.querySelector('.gallery-image-toolbar .btn-primary').click();
    await vi.waitFor(() => expect(document.querySelector('#galleryStatus').textContent).toContain('Image upload timed out'));
    expect(document.querySelectorAll('.gallery-image-card')).toHaveLength(7);
    expect(document.querySelector('.gallery-image-toolbar .btn-primary').disabled).toBe(false);
    expect(document.querySelectorAll('.gallery-image-status')[6].textContent).toContain('retry.jpg selected');

    await save();
    expect(state.images).toHaveLength(7);
  });
});
