import { createRoutesFromElements, matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routeTable } from './routes.tsx';

// Which route each URL lands on. Guards against patterns (/:username, /read/:key) swallowing static pages.
const routes = createRoutesFromElements(routeTable);
const leaf = (url: string) => matchRoutes(routes, url)?.at(-1)?.route.path;

describe('route table', () => {
  it.each([
    ['/', '/'],
    ['/write/new', '/write/new'],
    ['/write/k3Fq9ZpT2mXa', '/write/:articleId'],
    ['/me/articles', '/me/articles'],
    ['/me/trash', '/me/trash'],
    ['/admin/users', '/admin/users'],
    ['/admin/settings', '/admin/settings'],
    ['/settings', '/settings'],
    ['/signin', '/signin'],
    ['/mstr-code', '/:username'],
    ['/read/k3Fq9ZpT2mXa', '/read/:key'],
    ['/read/consistent-hashing', '/read/:key'],
    ['/read', '/:username'],          // "read" is a reserved username, so this is a not-found profile
    ['/mstr-code/url-shortener', '*'], // old-style article links no longer exist
    ['/a/b/c', '*']
  ])('%s → %s', (url, path) => {
    expect(leaf(url)).toBe(path);
  });
});
