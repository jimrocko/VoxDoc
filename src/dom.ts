type AttrValue = string | number | boolean | null | undefined | EventListener;
export type Attrs = Record<string, AttrValue>;
export type Child = Node | string | null | undefined | false;

/**
 * Erzeugt ein Element. Text wird immer als Textknoten eingefügt, nie als HTML –
 * Dokumenttitel und -texte stammen vom Benutzer.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) {
      continue;
    }
    if (typeof value === 'function') {
      element.addEventListener(key.replace(/^on/, '').toLowerCase(), value);
    } else if (key === 'class') {
      element.className = String(value);
    } else {
      element.setAttribute(key, value === true ? '' : String(value));
    }
  }
  element.append(
    ...children.filter((child): child is Node | string => child !== null && child !== undefined && child !== false),
  );
  return element;
}

export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element #${id} fehlt in index.html`);
  }
  return element as T;
}

/** Text mit Zeilenumbrüchen als Absätze darstellen. */
export function paragraphs(text: string): HTMLParagraphElement[] {
  return text
    .split(/\n\s*\n|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => h('p', null, line));
}
