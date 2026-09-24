'use client';

import { useEffect } from 'react';
import { translateUiToIndonesian } from '@/lib/ui-language-id';

const ATTRIBUTE_NAMES = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA']);

function translateTextNode(node: Text) {
  const parent = node.parentElement;
  if (!parent || SKIP_TAGS.has(parent.tagName) || parent.closest('[data-no-ui-translate="true"]')) return;
  const current = node.nodeValue || '';
  const next = translateUiToIndonesian(current);
  if (next !== current) node.nodeValue = next;
}

function translateElementAttributes(element: Element) {
  if (element.closest('[data-no-ui-translate="true"]')) return;
  for (const attribute of ATTRIBUTE_NAMES) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const next = translateUiToIndonesian(current);
    if (next !== current) element.setAttribute(attribute, next);
  }
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root as Text);
    return;
  }

  if (!(root instanceof Element) && root !== document.body) return;

  if (root instanceof Element) translateElementAttributes(root);

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
  );

  let current: Node | null = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      translateTextNode(current as Text);
    } else if (current instanceof Element) {
      translateElementAttributes(current);
    }
    current = walker.nextNode();
  }
}

export function IndonesianUiLocalizer() {
  useEffect(() => {
    document.documentElement.lang = 'id';
    document.documentElement.dataset.uiLanguage = 'id-ID';
    translateTree(document.body);

    let translating = false;
    const observer = new MutationObserver(mutations => {
      if (translating) return;
      translating = true;
      queueMicrotask(() => {
        try {
          for (const mutation of mutations) {
            if (mutation.type === 'characterData') {
              translateTree(mutation.target);
              continue;
            }
            for (const node of mutation.addedNodes) translateTree(node);
            if (mutation.target instanceof Element) translateElementAttributes(mutation.target);
          }
        } finally {
          translating = false;
        }
      });
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRIBUTE_NAMES]
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
