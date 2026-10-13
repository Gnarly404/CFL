/**
 * One consistent icon family (spec 22.5): 24px grid, 1.75 stroke, round caps. Built with the DOM so
 * no markup is ever parsed from a string. Decorative by default (aria-hidden).
 */
const NS = 'http://www.w3.org/2000/svg';

const SHAPES = {
  dashboard: [['path', { d: 'M3 10.5 12 3l9 7.5' }], ['path', { d: 'M5.5 9.5V21h13V9.5M9 21v-7h6v7' }]],
  curriculum: [['path', { d: 'M3 5.5C6 4.4 9.2 4.6 12 6.2c2.8-1.6 6-1.8 9-.7V19c-3-1.1-6.2-.9-9 .7-2.8-1.6-6-1.8-9-.7V5.5Z' }], ['path', { d: 'M12 6.2v13.5' }]],
  schedule: [['rect', { x: 3, y: 5, width: 18, height: 16, rx: 2 }], ['path', { d: 'M8 3v4M16 3v4M3 10h18' }]],
  notifications: [['path', { d: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4' }]],
  progress: [['path', { d: 'M4 20V11M10 20V5M16 20v-7M22 20H2' }]],
  messages: [['path', { d: 'M4 5.5h16v12H8l-4 3v-15Z' }], ['path', { d: 'M8 10h8M8 14h5' }]],
  settings: [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M12 2.8v2.1M12 19.1v2.1M21.2 12h-2.1M4.9 12H2.8M18.5 5.5 17 7M7 17l-1.5 1.5M18.5 18.5 17 17M7 7 5.5 5.5' }]],
  logout: [['path', { d: 'M10 4H5v16h5M14 8l4 4-4 4M8 12h10' }]],
  grammar: [['path', { d: 'M3 18 8 6l5 12M5 14h6' }], ['circle', { cx: 17.5, cy: 15, r: 3 }], ['path', { d: 'M20.5 12v6' }]],
  vocabulary: [['path', { d: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z' }], ['path', { d: 'M8 17h11M9 8h6' }]],
  listening: [['path', { d: 'M4 14v-2a8 8 0 0 1 16 0v2' }], ['rect', { x: 3, y: 14, width: 4, height: 6, rx: 1.5 }], ['rect', { x: 17, y: 14, width: 4, height: 6, rx: 1.5 }]],
  speaking: [['rect', { x: 9, y: 3, width: 6, height: 11, rx: 3 }], ['path', { d: 'M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6' }]],
  reading: [['path', { d: 'M3 5.5C6 4.4 9.2 4.6 12 6.2c2.8-1.6 6-1.8 9-.7V19c-3-1.1-6.2-.9-9 .7-2.8-1.6-6-1.8-9-.7V5.5Z' }], ['path', { d: 'M12 6.2v13.5' }]],
  writing: [['path', { d: 'M15 5l4 4L8 20l-5 1 1-5L15 5Z' }], ['path', { d: 'M13 7l4 4' }]],
  review: [['path', { d: 'M20 11a8 8 0 1 0-2.3 5.7' }], ['path', { d: 'M20 4v7h-7' }]],
  speaker: [['path', { d: 'M11 5 6 9H3v6h3l5 4V5Z' }], ['path', { d: 'M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12' }]],
  arrow: [['path', { d: 'M5 12h14M13 6l6 6-6 6' }]],
  check: [['path', { d: 'm5 12.5 4.5 4.5L19 7.5' }]],
  trash: [['path', { d: 'M4 7h16M10 11v6M14 11v6' }], ['path', { d: 'M5 7l1 14h12l1-14M9 7V4h6v3' }]],
};

export const iconNames = Object.keys(SHAPES);

export function icon(name, { size = 24, label } = {}) {
  const shapes = SHAPES[name];
  if (!shapes) throw new Error(`Unknown icon: ${name}`);
  const svg = document.createElementNS(NS, 'svg');
  const attrs = { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', focusable: 'false' };
  for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, String(value));
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
  for (const [tag, props] of shapes) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(props)) node.setAttribute(key, String(value));
    svg.append(node);
  }
  return svg;
}
