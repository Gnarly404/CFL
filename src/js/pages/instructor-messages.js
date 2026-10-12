import { guardPage } from '@/auth/guards.js';
import { mountInbox } from '@/messages/inbox.js';
import {
  loadContacts, loadMessages, markMessagesRead, sendMessage,
} from '@/services/message-service.js';
import { mountInstructorShell } from '@/ui/instructor-shell.js';
import { refreshWritingAttention } from '@/ui/instructor-attention.js';

const session = await guardPage({ roles: ['instructor'] });
mountInstructorShell('messages', session.role);
refreshWritingAttention(session.user.uid);
await mountInbox({
  viewer: { uid: session.user.uid, role: 'instructor' },
  services: { load: loadMessages, markRead: markMessagesRead, send: sendMessage, contacts: loadContacts },
});
