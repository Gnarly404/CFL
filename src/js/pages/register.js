import { initRegistration } from '@/registration/registration-controller.js';
import { initCopyReference, initStepper } from '@/registration/registration-ui.js';
import { listPublicProgrammes } from '@/services/programme-service.js';
import fallbackProgrammes from '../../data/programmes.json';

let programmes = fallbackProgrammes;
try {
  programmes = await listPublicProgrammes();
} catch (error) {
  console.warn('Could not load the programme list', error?.code ?? error);
}
const registration = initRegistration({ programmes });
initStepper({ goTo: (index) => registration?.showStep(index), current: () => registration?.step ?? 0 });
initCopyReference();
