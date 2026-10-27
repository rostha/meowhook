import DocsRouteEffects from '@/components/DocsRouteEffects';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DocsRouteEffects />
      {children}
    </>
  );
}
