import pkg from '../../package.json';
import nextPkg from 'next/package.json';

/** Semantic version from the app `package.json` (e.g. `0.1.0`). */
export const APP_VERSION = pkg.version;

const nextMajorMinor = nextPkg.version.split('.').slice(0, 2).join('.');

/** Installed Next.js release for footer / about text (e.g. `16.2`). */
export const NEXTJS_VERSION_LABEL = `Next.js ${nextMajorMinor}`;
