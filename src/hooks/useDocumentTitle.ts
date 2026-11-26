import { useEffect } from 'react';
import { DEFAULT_DOCUMENT_TITLE } from '../utils/documentTitle';

export function useDocumentTitle(title?: string | null): void {
  useEffect(() => {
    if (typeof document === 'undefined' || !title) return;
    document.title = title;
  }, [title]);
}

export function resetDocumentTitle(): void {
  if (typeof document !== 'undefined') {
    document.title = DEFAULT_DOCUMENT_TITLE;
  }
}
