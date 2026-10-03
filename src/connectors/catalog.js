export const connectors = [
  { id: 'github', name: 'GitHub', status: 'available', capabilities: ['scan:gists', 'filter', 'preview', 'delete:gists'] },
  { id: 'reddit', name: 'Reddit', status: 'next', capabilities: ['scan:posts', 'scan:comments', 'delete:own-content'] },
  { id: 'telegram', name: 'Telegram', status: 'next', capabilities: ['scan:messages', 'delete:permitted-messages'] },
  { id: 'x', name: 'X', status: 'research', capabilities: ['scan:posts', 'delete:posts'] }
];
