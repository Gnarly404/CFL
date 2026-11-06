import {
  deleteObject, getDownloadURL, ref, uploadBytesResumable,
} from 'firebase/storage';
import { el } from '@/utils/dom.js';
import { storageService } from '@/services/firebase-storage.js';
import { loadGalleryImages, saveGalleryImages } from '@/services/gallery-service.js';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const OPTIMIZE_ABOVE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2000;
const TARGET_UPLOAD_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const newId = () => globalThis.crypto?.randomUUID?.().replace(/-/g, '')
  ?? `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

function imageError(file) {
  if (!IMAGE_TYPES.has(file.type)) return 'Choose a JPEG, PNG or WebP image.';
  if (file.size >= MAX_IMAGE_BYTES) return 'Images must be smaller than 15 MB.';
  return '';
}

function encodeCanvas(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The browser could not prepare this image.'));
    }, type, quality);
  });
}

async function prepareImage(file, onStatus) {
  if (file.size <= OPTIMIZE_ABOVE_BYTES) return file;
  if (typeof createImageBitmap !== 'function') {
    throw new Error('This browser cannot optimize large images. Please resize it to under 2 MB and try again.');
  }

  onStatus(`Optimizing ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)…`);
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser could not prepare this image.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const qualities = file.type === 'image/png' ? [undefined] : [0.82, 0.68, 0.55, 0.45];
    let optimized = null;
    for (const quality of qualities) {
      optimized = await encodeCanvas(canvas, file.type, quality);
      if (optimized.size <= TARGET_UPLOAD_BYTES) break;
    }
    if (optimized.size >= file.size) return file;
    if (optimized.size >= MAX_IMAGE_BYTES) {
      throw new Error('The optimized image is still too large. Resize it and try again.');
    }
    return optimized;
  } finally {
    bitmap.close();
  }
}

function uploadFile(destination, file, onProgress) {
  const task = uploadBytesResumable(destination, file, {
    contentType: file.type,
    cacheControl: 'public, max-age=300',
  });
  return new Promise((resolve, reject) => {
    task.on('state_changed',
      (snapshot) => onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)),
      reject,
      () => resolve(task.snapshot));
  });
}

export function initGalleryAdmin({ root = document } = {}) {
  const grid = root.querySelector('#galleryImages');
  if (!grid) return;

  const status = root.querySelector('#galleryStatus');
  const announce = (text, kind = 'info') => {
    if (!status) return;
    status.textContent = text;
    status.dataset.kind = kind;
  };
  const manager = el('fieldset', { class: 'gallery-admin-manager', disabled: true });
  const pendingFiles = new Map();
  const pendingPreviews = new Map();
  let images = [];
  let savedImages = [];
  let dirty = false;
  const storage = storageService();

  const titleInput = el('input', { class: 'form-control', type: 'text', maxlength: 100, required: true, id: 'newGalleryTitle' });
  const captionInput = el('textarea', { class: 'form-control', maxlength: 240, required: true, id: 'newGalleryCaption', rows: 2 });
  const newFileInput = el('input', { class: 'form-control', type: 'file', accept: [...IMAGE_TYPES].join(','), required: true, id: 'newGalleryFile' });
  const addButton = el('button', { type: 'submit', class: 'btn btn-sm btn-primary' }, 'Add image');
  const addForm = el('form', { class: 'gallery-image-form' },
    el('h3', {}, 'Add an image'),
    el('div', { class: 'gallery-image-fields' },
      el('label', { for: titleInput.id }, 'Title', titleInput),
      el('label', { for: captionInput.id }, 'Short description', captionInput),
      el('label', { for: newFileInput.id }, 'Image file', newFileInput)),
    addButton);
  const saveButton = el('button', { type: 'button', class: 'btn btn-primary', disabled: true }, 'Save changes');
  const discardButton = el('button', { type: 'button', class: 'btn btn-outline-secondary', disabled: true }, 'Discard changes');
  const toolbar = el('div', { class: 'gallery-image-toolbar' }, saveButton, discardButton);
  grid.replaceWith(manager);
  manager.append(el('legend', {}, 'Manage gallery'), addForm, toolbar, grid);

  function setDirty(value = true) {
    dirty = value;
    saveButton.disabled = !dirty;
    discardButton.disabled = !dirty;
  }

  function setPendingFile(imageId, file) {
    const previousUrl = pendingPreviews.get(imageId);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    pendingFiles.set(imageId, file);
    pendingPreviews.set(imageId, URL.createObjectURL(file));
  }

  function clearPendingPreviews() {
    pendingPreviews.forEach((url) => URL.revokeObjectURL(url));
    pendingPreviews.clear();
  }

  function render() {
    grid.replaceChildren();
    images.forEach((image, index) => {
      const preview = el('img', {
        src: pendingPreviews.get(image.id) || image.src || '/images/logo.png',
        alt: `${image.title}: ${image.caption}`,
        loading: 'lazy',
      });
      if (image.path) {
        getDownloadURL(ref(storage, image.path)).then((url) => {
          if (preview.isConnected) preview.src = url;
        }).catch((error) => {
          announce(`Could not load "${image.title}": ${error.message || 'storage unavailable.'}`, 'error');
        });
      }

      const title = el('input', { class: 'form-control', type: 'text', maxlength: 100, required: true, value: image.title });
      const caption = el('textarea', { class: 'form-control', maxlength: 240, required: true, rows: 2 }, image.caption);
      title.addEventListener('input', () => {
        image.title = title.value;
        preview.alt = `${image.title}: ${image.caption}`;
        setDirty();
      });
      caption.addEventListener('input', () => {
        image.caption = caption.value;
        preview.alt = `${image.title}: ${image.caption}`;
        setDirty();
      });

      const replacementInput = el('input', {
        class: 'visually-hidden',
        type: 'file',
        accept: [...IMAGE_TYPES].join(','),
        'aria-label': `Choose a replacement image for ${image.title}`,
      });
      const imageStatus = el('p', { class: 'gallery-image-status', role: 'status', 'aria-live': 'polite' },
        pendingFiles.has(image.id) ? `${pendingFiles.get(image.id).name} selected; save to publish.` : image.path ? 'Custom image.' : 'Original image.');
      replacementInput.addEventListener('change', () => {
        const [file] = replacementInput.files;
        replacementInput.value = '';
        if (!file) return;
        const error = imageError(file);
        if (error) {
          imageStatus.textContent = error;
          announce(`${image.title}: ${error}`, 'error');
          return;
        }
        setPendingFile(image.id, file);
        preview.src = pendingPreviews.get(image.id);
        imageStatus.textContent = `${file.name} selected; save to publish.`;
        setDirty();
      });

      const moveUp = el('button', {
        type: 'button',
        class: 'btn btn-sm btn-outline-secondary',
        disabled: index === 0,
        'aria-label': `Move ${image.title} up`,
        onclick: () => {
          [images[index - 1], images[index]] = [images[index], images[index - 1]];
          setDirty();
          render();
        },
      }, 'Move up');
      const moveDown = el('button', {
        type: 'button',
        class: 'btn btn-sm btn-outline-secondary',
        disabled: index === images.length - 1,
        'aria-label': `Move ${image.title} down`,
        onclick: () => {
          [images[index + 1], images[index]] = [images[index], images[index + 1]];
          setDirty();
          render();
        },
      }, 'Move down');
      const remove = el('button', {
        type: 'button',
        class: 'btn btn-sm btn-outline-danger',
        onclick: () => {
          if (!window.confirm(`Remove "${image.title}" from the gallery?`)) return;
          images = images.filter((entry) => entry.id !== image.id);
          pendingFiles.delete(image.id);
          const previewUrl = pendingPreviews.get(image.id);
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          pendingPreviews.delete(image.id);
          setDirty();
          render();
        },
      }, 'Delete');
      const replace = el('label', { class: 'btn btn-sm btn-outline-secondary gallery-image-pick' }, 'Replace image', replacementInput);
      grid.append(el('article', { class: 'gallery-image-card' },
        preview,
        el('div', { class: 'gallery-image-details' },
          el('label', {}, 'Title', title),
          el('label', {}, 'Short description', caption),
          imageStatus,
          el('div', { class: 'gallery-image-actions' }, moveUp, moveDown, replace, remove))));
    });
  }

  addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const [file] = newFileInput.files;
    if (!file) return;
    const error = imageError(file);
    if (error) {
      announce(error, 'error');
      return;
    }
    images.push({
      id: newId(),
      title: titleInput.value.trim(),
      caption: captionInput.value.trim(),
      category: 'students',
      path: null,
      src: null,
    });
    const image = images.at(-1);
    setPendingFile(image.id, file);
    titleInput.value = '';
    captionInput.value = '';
    newFileInput.value = '';
    setDirty();
    render();
  });

  saveButton.addEventListener('click', async () => {
    if (!dirty) return;
    manager.disabled = true;
    announce('Saving gallery changes…');
    let writingMetadata = false;
    const uploadedPaths = [];
    try {
      const nextImages = [];
      const uploadCount = [...pendingFiles.keys()].filter((id) => images.some((image) => image.id === id)).length;
      let uploadNumber = 0;
      for (const image of images) {
        const file = pendingFiles.get(image.id);
        if (!file) {
          nextImages.push(image);
          continue;
        }
        const path = `public/gallery/${image.id}-${newId()}`;
        uploadNumber += 1;
        const preparedFile = await prepareImage(file, (message) => {
          announce(`Image ${uploadNumber} of ${uploadCount}: ${message}`);
        });
        const uploadLabel = preparedFile !== file
          ? `${file.name} (${(preparedFile.size / 1024 / 1024).toFixed(1)} MB after optimization)`
          : file.name;
        announce(`Starting upload ${uploadNumber} of ${uploadCount}: ${uploadLabel}…`);
        await uploadFile(ref(storage, path), preparedFile, (percent) => {
          if (percent > 0) {
            announce(`Uploading image ${uploadNumber} of ${uploadCount}: ${uploadLabel} (${Math.max(1, percent)}%).`);
          }
        });
        uploadedPaths.push(path);
        nextImages.push({ ...image, path, src: null });
      }

      writingMetadata = true;
      const retiredPaths = await saveGalleryImages(nextImages);
      images = nextImages;
      savedImages = images.map((image) => ({ ...image }));
      pendingFiles.clear();
      clearPendingPreviews();
      setDirty(false);
      render();

      const cleanup = await Promise.allSettled(retiredPaths.map((path) => deleteObject(ref(storage, path))));
      const failedCleanup = cleanup.filter((result) => result.status === 'rejected');
      if (failedCleanup.length) {
        failedCleanup.forEach((result) => console.warn('Could not remove retired gallery image', result.reason?.code ?? result.reason));
        announce('Gallery saved, but some replaced or deleted image files could not be removed.', 'error');
      } else {
        announce('Gallery changes saved.', 'success');
      }
    } catch (error) {
      if (!writingMetadata) {
        const cleanup = await Promise.allSettled(uploadedPaths.map((path) => deleteObject(ref(storage, path))));
        cleanup.filter((result) => result.status === 'rejected').forEach((result) => {
          console.warn('Could not clean up an unused gallery upload', result.reason?.code ?? result.reason);
        });
      }
      const message = error.code === 'storage/retry-limit-exceeded'
        ? 'Image upload timed out after repeated connection retries. Check the connection and try Save changes again; your edits are still here.'
        : error.message || 'please try again.';
      announce(`Could not save gallery changes: ${message}`, 'error');
    } finally {
      manager.disabled = false;
    }
  });

  discardButton.addEventListener('click', async () => {
    manager.disabled = true;
    try {
      images = await loadGalleryImages();
      savedImages = images.map((image) => ({ ...image }));
      pendingFiles.clear();
      clearPendingPreviews();
      setDirty(false);
      render();
      announce('Unsaved changes discarded.');
    } catch (error) {
      announce(`Could not reload gallery images: ${error.message || 'please try again.'}`, 'error');
    } finally {
      manager.disabled = false;
    }
  });

  announce('Loading gallery images…');
  loadGalleryImages().then((loaded) => {
    images = loaded.map((image) => ({ ...image }));
    savedImages = images.map((image) => ({ ...image }));
    manager.disabled = false;
    render();
    announce(`${images.length} gallery image${images.length === 1 ? '' : 's'} loaded.`);
  }).catch((error) => {
    announce(`Could not load gallery images: ${error.message || 'please try again.'}`, 'error');
  });

  return { get images() { return savedImages.map((image) => ({ ...image })); } };
}
