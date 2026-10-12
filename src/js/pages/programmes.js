import fallback from '../../data/programmes.json';
import { listPublicProgrammes } from '@/services/programme-service.js';
import { initProgrammesPage } from './programmes-view.js';

async function load() {
  try {
    return await listPublicProgrammes();
  } catch (error) {
    console.warn('Could not load programmes from the database', error?.code ?? error);
    return fallback;
  }
}

const page = initProgrammesPage({ load });
await page.start();
