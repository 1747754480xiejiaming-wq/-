export const publicNavigation = [
  ['首页', '/'],
  ['问茶', '/qa'],
  ['茶叶品类', '/catalog'],
  ['工作台', '/admin'],
] as const;

export const mobilePublicNavigation = [
  ['首页', '/', 'leaf'],
  ['问茶', '/qa', 'chat'],
  ['茶叶品类', '/catalog', 'book'],
  ['工作台', '/admin', 'users'],
] as const;

export function isPublicNavigationActive(path: string, target: string) {
  const section = path.split('/').filter(Boolean)[0] ?? '';
  if (target === '/') return path === '/';
  if (target === '/qa') return section === 'qa' || section === 'brew';
  if (target === '/catalog') return ['catalog', 'tea', 'inquiry', 'receipt'].includes(section);
  if (target === '/admin') return section === 'admin';
  return path.startsWith(target);
}
