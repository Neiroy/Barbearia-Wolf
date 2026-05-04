/**
 * Contêiner padrão das telas: limita largura em monitores grandes e aumenta
 * o espaço vertical entre blocos (PageHeader, SectionCard, grids).
 */
export function PageFrame({ children, className = '' }) {
  return (
    <section
      className={`mx-auto flex w-full max-w-[min(100%,96rem)] flex-col gap-8 pb-8 sm:gap-10 sm:pb-10 ${className}`}
    >
      {children}
    </section>
  )
}
