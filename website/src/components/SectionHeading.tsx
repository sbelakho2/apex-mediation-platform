type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  headingId?: string;
  tone?: 'dark' | 'light';
};

/**
 * Shared heading block to keep typography and spacing consistent across sections.
 */
export default function SectionHeading({ eyebrow, title, description, align = 'left', headingId, tone = 'dark' }: SectionHeadingProps) {
  const alignment = align === 'center' ? 'items-center text-center' : 'items-start text-left';
  const titleClass = tone === 'light' ? 'text-white' : 'text-gray-900';
  const descriptionClass = tone === 'light' ? 'text-white/80' : 'text-gray-700';
  const eyebrowClass = tone === 'light' ? 'text-white/70' : 'text-gray-600';

  return (
    <div className={`flex flex-col gap-3 ${alignment}`}>
      {eyebrow ? (
        <span className={`text-xs font-semibold uppercase tracking-[0.28em] ${eyebrowClass}`}>
          {eyebrow}
        </span>
      ) : null}
      <h2 id={headingId} className={`text-3xl font-semibold sm:text-4xl ${titleClass}`}>
        {title}
      </h2>
      {description ? (
        <p className={`max-w-2xl text-base ${descriptionClass}`}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
