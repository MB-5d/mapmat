import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import EditNodeModal from './EditNodeModal';

describe('EditNodeModal', () => {
  let container;
  let root;

  const setInputValue = (element, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    descriptor.set.call(element, value);
  };

  const setTextareaValue = (element, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    descriptor.set.call(element, value);
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
    jest.clearAllMocks();
  });

  test('saves updated page fields through the shared form controls', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    act(() => {
      root.render(
        <EditNodeModal
          node={{
            id: '1',
            title: 'Old title',
            url: 'https://example.com/old',
            pageType: 'Page',
            annotations: { status: 'none', tags: [], note: '' },
          }}
          allNodes={[]}
          rootTree={null}
          onClose={onClose}
          onSave={onSave}
          mode="edit"
          customPageTypes={[]}
          onAddCustomType={jest.fn()}
          specialParentOptions={[]}
        />
      );
    });

    const titleInput = container.querySelector('.edit-node-form input[type="text"]');

    act(() => {
      setInputValue(titleInput, 'Updated title');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save Changes')
    );

    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Updated title',
        url: 'https://example.com/old',
        pageType: 'Page',
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('normalizes scanned SEO metadata and preserves it on save', () => {
    const onSave = jest.fn();
    const onClose = jest.fn();

    act(() => {
      root.render(
        <EditNodeModal
          node={{
            id: '1',
            title: 'Scanned page',
            url: 'https://example.com/page',
            pageType: 'Page',
            description: '',
            metaTags: { keywords: ['seo', 'marketing'] },
            canonicalUrl: 'https://example.com/canonical',
            seoMetadata: {
              description: 'Scanned description',
              h1: 'Scanned H1',
              h2: 'Scanned H2',
              robots: 'index, follow',
              language: 'en',
              openGraph: { title: 'OG title' },
              twitter: { card: 'summary_large_image' },
            },
            annotations: { status: 'none', tags: ['review'], note: 'Keep me' },
          }}
          allNodes={[]}
          rootTree={null}
          onClose={onClose}
          onSave={onSave}
          mode="edit"
          customPageTypes={[]}
          onAddCustomType={jest.fn()}
          specialParentOptions={[]}
        />
      );
    });

    const textareas = container.querySelectorAll('textarea');
    expect(textareas[0].value).toBe('Scanned description');
    expect(textareas[1].value).toBe('seo, marketing');
    expect(container.textContent).toContain('SEO Metadata');
    expect(container.querySelector('input[value="Scanned H1"]')).not.toBeNull();

    act(() => {
      setTextareaValue(textareas[0], 'Edited description');
      textareas[0].dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save Changes')
    );

    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Edited description',
        metaTags: 'seo, marketing',
        canonicalUrl: 'https://example.com/canonical',
        seoMetadata: expect.objectContaining({
          description: 'Edited description',
          keywords: 'seo, marketing',
          h1: 'Scanned H1',
          robots: 'index, follow',
        }),
        annotations: expect.objectContaining({
          tags: ['review'],
          note: 'Keep me',
        }),
      })
    );
  });

  test('shows read-only page insights when provided', () => {
    act(() => {
      root.render(
        <EditNodeModal
          node={{
            id: '1',
            title: 'Scanned page',
            url: 'https://example.com/page',
            pageType: 'Page',
            annotations: { status: 'none', tags: [], note: '' },
          }}
          allNodes={[]}
          rootTree={null}
          onClose={jest.fn()}
          onSave={jest.fn()}
          mode="edit"
          customPageTypes={[]}
          onAddCustomType={jest.fn()}
          specialParentOptions={[]}
          insightSummary={{
            score: 82,
            findingCount: 2,
            topFindings: [
              {
                id: 'seo-1',
                title: 'Missing meta description',
                recommendation: 'Add a clear description.',
              },
            ],
          }}
        />
      );
    });

    expect(container.textContent).toContain('Page Insights');
    expect(container.textContent).toContain('82/100');
    expect(container.textContent).toContain('2 findings');
    expect(container.textContent).toContain('Missing meta description');
  });

  test('only allows one Home page type', () => {
    act(() => {
      root.render(
        <EditNodeModal
          node={{
            id: '2',
            title: 'Second page',
            url: 'https://example.com/about',
            pageType: 'Page',
            annotations: { status: 'none', tags: [], note: '' },
          }}
          allNodes={[
            { id: 'root', title: 'Home', pageType: 'Home' },
            { id: '2', title: 'Second page', pageType: 'Page' },
          ]}
          rootTree={null}
          onClose={jest.fn()}
          onSave={jest.fn()}
          mode="edit"
          customPageTypes={[]}
          onAddCustomType={jest.fn()}
          specialParentOptions={[]}
        />
      );
    });

    const pageTypeSelect = Array.from(container.querySelectorAll('select')).find((select) =>
      Array.from(select.options).some((option) => option.value === 'Home')
    );
    const homeOption = Array.from(pageTypeSelect.options).find((option) => option.value === 'Home');

    expect(homeOption.disabled).toBe(true);
    expect(homeOption.textContent).toBe('Home (already used)');
  });

  test('locks the first page as Home when creating a new map', () => {
    const onSave = jest.fn();

    act(() => {
      root.render(
        <EditNodeModal
          node={{
            id: '',
            title: '',
            url: '',
            parentId: '__home__',
            children: [],
            annotations: { status: 'none', tags: [], note: '' },
          }}
          allNodes={[]}
          rootTree={null}
          onClose={jest.fn()}
          onSave={onSave}
          mode="add"
          customPageTypes={[]}
          onAddCustomType={jest.fn()}
          specialParentOptions={[{ value: '__home__', label: 'No Parent (Home)' }]}
          isHomePageCreation
        />
      );
    });

    expect(container.textContent).toContain('Add Home Page');
    expect(container.textContent).not.toContain('Parent Page');

    const disabledHomeInput = Array.from(container.querySelectorAll('input')).find((input) =>
      input.value === 'Home'
    );
    expect(disabledHomeInput).not.toBeNull();
    expect(disabledHomeInput.disabled).toBe(true);

    const titleInput = container.querySelector('.edit-node-form input[type="text"]:not(:disabled)');
    act(() => {
      setInputValue(titleInput, 'Homepage');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Add Home Page')
    );
    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Homepage',
      pageType: 'Home',
      parentId: '__home__',
    }));
  });
});
