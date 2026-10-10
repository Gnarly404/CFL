/**
 * Inline styles go through the CSSOM (style.setProperty) rather than the style attribute, so a strict
 * Content-Security-Policy (style-src 'self') does not block them. Accepts "--value:40%;color:red".
 */
function applyStyle(node, text) {
  for (const declaration of text.split(';')) {
    const at = declaration.indexOf(':');
    if (at > 0) node.style.setProperty(declaration.slice(0, at).trim(), declaration.slice(at + 1).trim());
  }
}

/** Tiny element builder. Text is always inserted as text, never as HTML. */
export function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === 'style') applyStyle(node, String(value));
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  node.append(...children.flat().filter((child) => child != null && child !== false));
  return node;
}
