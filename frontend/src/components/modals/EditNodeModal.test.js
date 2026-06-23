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
      button.textContent.includes('Save changes')
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

    expect(container.textContent).toContain('SEO metadata');
    expect(container.querySelector('input[value="Scanned H1"]')).toBeNull();

    const seoToggle = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('SEO metadata')
    );
    expect(seoToggle).not.toBeUndefined();
    expect(seoToggle.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      seoToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(seoToggle.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('input[value="Scanned H1"]')).not.toBeNull();
    const textareas = Array.from(container.querySelectorAll('textarea'));
    const descriptionTextarea = textareas.find((textarea) => textarea.value === 'Scanned description');
    const metaTagsTextarea = textareas.find((textarea) => textarea.value === 'seo, marketing');
    expect(descriptionTextarea).not.toBeUndefined();
    expect(metaTagsTextarea).not.toBeUndefined();

    act(() => {
      setTextareaValue(descriptionTextarea, 'Edited description');
      descriptionTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save changes')
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

  test('shows scan status as header metadata instead of a body section', () => {
    act(() => {
      root.render(
        <EditNodeModal
          node={{
            id: 'node-1',
            title: 'Missing page',
            url: 'https://example.com/missing',
            pageType: 'Page',
            httpStatus: 404,
          }}
          allNodes={[]}
          rootTree={null}
          onClose={jest.fn()}
          onSave={jest.fn()}
          mode="edit"
        />
      );
    });

    expect(container.textContent).toContain('Page details');
    const modalHeader = container.querySelector('.modal-header');
    expect(modalHeader.textContent).toContain('Scan status: HTTP 404 / Not Found');
    expect(container.querySelector('.edit-node-form').textContent).not.toContain('Scan status');
    expect(container.textContent).not.toMatch(/HTTP status/i);
  });

  test('views the best available saved image asset from the thumbnail section', () => {
    const onViewImage = jest.fn();

    act(() => {
      root.render(
        <EditNodeModal
          node={{
            id: 'node-1',
            title: 'Image page',
            url: 'https://example.com/image',
            pageType: 'Page',
            thumbnailUrl: '/screenshots/node_thumb_v1.jpg',
            thumbnailFullUrl: '/screenshots/node_thumb_full_v1.jpg',
            fullScreenshotUrl: '/screenshots/node_full_v1.jpg',
          }}
          allNodes={[]}
          rootTree={null}
          onClose={jest.fn()}
          onSave={jest.fn()}
          onViewImage={onViewImage}
          mode="edit"
        />
      );
    });

    const viewButton = container.querySelector('button[aria-label="View full size image"]');
    const replaceButton = container.querySelector('button[aria-label="Replace image"]');
    const deleteImageButton = container.querySelector('button[aria-label="Delete image"]');
    expect(viewButton).not.toBeNull();
    expect(replaceButton).not.toBeNull();
    expect(deleteImageButton).not.toBeNull();
    expect(container.querySelector('.btn-remove-thumb')).toBeNull();

    act(() => {
      viewButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onViewImage).toHaveBeenCalledWith('/screenshots/node_full_v1.jpg', true, 'node-1', 'full');
  });

  test('shows the replace image upload overlay from the thumbnail section', () => {
    act(() => {
      root.render(
        <EditNodeModal
          node={{
            id: 'node-1',
            title: 'Image page',
            url: 'https://example.com/image',
            pageType: 'Page',
            thumbnailUrl: '/screenshots/node_thumb_v1.jpg',
          }}
          allNodes={[]}
          rootTree={null}
          onClose={jest.fn()}
          onSave={jest.fn()}
          onViewImage={jest.fn()}
          mode="edit"
        />
      );
    });

    act(() => {
      container.querySelector('button[aria-label="Replace image"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.thumbnail-preview-overlay--replace')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Cancel image replacement"]')).not.toBeNull();
    expect(container.textContent).toContain('Drag image here or');
    expect(container.textContent).toContain('Browse files');
  });

  test('clears thumbnail image fields from the delete image overlay', () => {
    const onSave = jest.fn();

    act(() => {
      root.render(
        <EditNodeModal
          node={{
            id: 'node-1',
            title: 'Image page',
            url: 'https://example.com/image',
            pageType: 'Page',
            thumbnailUrl: '/screenshots/node_thumb_v1.jpg',
            thumbnailFullUrl: '/screenshots/node_thumb_full_v1.jpg',
            fullScreenshotUrl: '/screenshots/node_full_v1.jpg',
          }}
          allNodes={[]}
          rootTree={null}
          onClose={jest.fn()}
          onSave={onSave}
          onViewImage={jest.fn()}
          mode="edit"
        />
      );
    });

    act(() => {
      container.querySelector('button[aria-label="Delete image"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.thumbnail-preview-overlay--delete')).not.toBeNull();
    expect(container.textContent).toContain("Deleting the image can't be undone.");

    const deleteButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent.includes('Delete image'));

    act(() => {
      deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.thumbnail-preview')).toBeNull();
    expect(container.querySelector('.image-upload-zone')).not.toBeNull();

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save changes')
    );

    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      thumbnailUrl: '',
      thumbnailFullUrl: '',
      fullScreenshotUrl: '',
    }));
  });

  test('does not show image action buttons when no image is available', () => {
    act(() => {
      root.render(
        <EditNodeModal
          node={{
            id: 'node-1',
            title: 'Image page',
            url: 'https://example.com/image',
            pageType: 'Page',
          }}
          allNodes={[]}
          rootTree={null}
          onClose={jest.fn()}
          onSave={jest.fn()}
          onViewImage={jest.fn()}
          mode="edit"
        />
      );
    });

    expect(container.querySelector('button[aria-label="View full size image"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Replace image"]')).toBeNull();
    expect(container.querySelector('button[aria-label="Delete image"]')).toBeNull();
  });

  test('uploads inline thumbnail data before saving', async () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    const onUploadNodeImageAsset = jest.fn().mockResolvedValue({
      assetUrl: '/screenshots/uploaded-node-thumb.png',
    });

    await act(async () => {
      root.render(
        <EditNodeModal
          node={{
            id: 'node-1',
            title: 'Uploaded page',
            url: 'https://example.com/page',
            pageType: 'Page',
            thumbnailUrl: 'data:image/png;base64,aW1hZ2U=',
          }}
          allNodes={[]}
          rootTree={null}
          onClose={onClose}
          onSave={onSave}
          onUploadNodeImageAsset={onUploadNodeImageAsset}
          mode="edit"
        />
      );
    });

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Save changes')
    );

    await act(async () => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onUploadNodeImageAsset).toHaveBeenCalledWith({
      nodeId: 'node-1',
      imageDataUrl: 'data:image/png;base64,aW1hZ2U=',
    });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      thumbnailUrl: '/screenshots/uploaded-node-thumb.png',
    }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('shows delete action in edit mode when provided', () => {
    const onDelete = jest.fn();

    act(() => {
      root.render(
        <EditNodeModal
          node={{ id: 'node-1', title: 'Scanned page', url: 'https://example.com/page', pageType: 'Page' }}
          allNodes={[]}
          rootTree={{ id: 'root', children: [] }}
          onClose={jest.fn()}
          onSave={jest.fn()}
          onDelete={onDelete}
          mode="edit"
        />
      );
    });

    const deleteButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Delete');
    const cancelButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Cancel');
    expect(deleteButton).not.toBeUndefined();
    expect(cancelButton.className).toContain('ui-btn--style-mono');

    act(() => {
      deleteButton.click();
    });

    expect(onDelete).toHaveBeenCalledWith('node-1');
  });

  test('shows duplicate source link and locate action for duplicate pages', () => {
    const onLocateUrl = jest.fn();

    act(() => {
      root.render(
        <EditNodeModal
          node={{
            id: 'node-1',
            title: 'Duplicate page',
            url: 'https://example.com/page?copy=1',
            pageType: 'Page',
            isDuplicate: true,
            duplicateOf: 'https://example.com/page',
          }}
          allNodes={[]}
          rootTree={{ id: 'root', children: [] }}
          onClose={jest.fn()}
          onSave={jest.fn()}
          onLocateUrl={onLocateUrl}
          canLocateUrl={() => true}
          mode="edit"
        />
      );
    });

    expect(container.textContent).toContain('Duplicate page');
    expect(container.textContent).toContain('Duplicate of');
    expect(container.textContent).toContain('example.com/page');
    expect(container.textContent).toContain('Open page');

    const showOnMapButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Show on map');
    expect(showOnMapButton).not.toBeUndefined();

    act(() => {
      showOnMapButton.click();
    });

    expect(onLocateUrl).toHaveBeenCalledWith('https://example.com/page');
  });

  test('does not show duplicate source section for normal pages', () => {
    act(() => {
      root.render(
        <EditNodeModal
          node={{
            id: 'node-1',
            title: 'Normal page',
            url: 'https://example.com/page',
            pageType: 'Page',
          }}
          allNodes={[]}
          rootTree={{ id: 'root', children: [] }}
          onClose={jest.fn()}
          onSave={jest.fn()}
          onLocateUrl={jest.fn()}
          mode="edit"
        />
      );
    });

    expect(container.textContent).not.toContain('Duplicate page');
    expect(container.textContent).not.toContain('Show on map');
  });

  test('shows the previous position for moved pages', () => {
    act(() => {
      root.render(
        <EditNodeModal
          node={{
            id: 'node-1',
            title: 'Moved page',
            url: 'https://example.com/page',
            pageType: 'Page',
            annotations: {
              status: 'moved',
              tags: [],
              note: '',
              meta: { movedFromPosition: '1.2' },
            },
          }}
          allNodes={[]}
          rootTree={{ id: 'root', children: [] }}
          onClose={jest.fn()}
          onSave={jest.fn()}
          mode="edit"
        />
      );
    });

    expect(container.textContent).toContain('Move details');
    expect(container.textContent).toContain('Moved from position');
    expect(container.textContent).toContain('1.2');
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

    expect(container.textContent).toContain('Add home page');
    expect(container.textContent).not.toContain('Parent page');

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
      button.textContent.includes('Add home page')
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
