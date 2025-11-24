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
  const titleClass = tone === 'light' ? 'text-white' : 'text-ink';
  const descriptionClass = tone === 'light' ? 'text-white/80' : 'text-inkMuted';
  const eyebrowClass = tone === 'light' ? 'text-white/70' : '';

  return (
    <div className={`flex flex-col gap-3 ${alignment}`}>
      {eyebrow ? (
        <span className={`eyebrow ${eyebrowClass}`}>
          {eyebrow}
        </span>
      ) : null}
      <h2
        id={headingId}
        className={`font-display text-[2.25rem] leading-[1.15] tracking-[-0.01em] sm:text-[2.75rem] ${titleClass}`}
      >
        {title}
      </h2>
      {description ? (
        <p className={`max-w-2xl text-[1.0625rem] leading-[1.6] ${descriptionClass}`}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
