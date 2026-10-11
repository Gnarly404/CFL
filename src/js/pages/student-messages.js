import { guardPage } from '@/auth/guards.js';
import { mountInbox } from '@/messages/inbox.js';
import {
  loadContacts, loadMessages, markMessagesRead, sendMessage,
} from '@/services/message-service.js';
import { mountNotificationBadge } from '@/ui/notification-badge.js';
import { mountPortalShell } from '@/ui/portal-shell.js';

mountPortalShell('messages');
const session = await guardPage({ roles: ['student'] });
mountNotificationBadge(session.user.uid);
await mountInbox({
  viewer: { uid: session.user.uid, role: 'student' },
  services: { load: loadMessages, markRead: markMessagesRead, send: sendMessage, contacts: loadContacts },
});
