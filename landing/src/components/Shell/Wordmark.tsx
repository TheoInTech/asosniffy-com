import Image from "next/image";

export function Wordmark({ withMark = true }: { withMark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 leading-none">
      {withMark ? (
        <Image
          src="/sniffy/logo-transparent.png"
          alt=""
          width={32}
          height={32}
          priority
          className="h-8 w-8"
        />
      ) : null}
      <span className="font-display text-xl font-semibold tracking-tight text-sniffy-ink">
        Sniffy
      </span>
    </span>
  );
}
