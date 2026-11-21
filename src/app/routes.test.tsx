import { createRoutesFromElements, matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routeTable } from './routes.tsx';

// Which route each URL lands on. Guards against patterns (/:username/:slug) swallowing static pages.
const routes = createRoutesFromElements(routeTable);
const leaf = (url: string) => matchRoutes(routes, url)?.at(-1)?.route.path;

describe('route table', () => {
  it.each([
    ['/', '/'],
    ['/write/new', '/write/new'],
    ['/write/0b1c-uuid', '/write/:articleId'],
    ['/me/articles', '/me/articles'],
    ['/admin/users', '/admin/users'],
    ['/admin/settings', '/admin/settings'],
    ['/settings', '/settings'],
    ['/signin', '/signin'],
    ['/mstr-code', '/:username'],
    ['/mstr-code/url-shortener', '/:username/:slug'],
    ['/a/b/c', '*']
  ])('%s → %s', (url, path) => {
    expect(leaf(url)).toBe(path);
  });
});
