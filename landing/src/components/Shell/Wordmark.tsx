import Image from "next/image";

export function Wordmark({ withMark = true }: { withMark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 leading-none">
      {withMark ? (
        <Image
          src="/sniffy/mascot-mark.svg"
          alt=""
          width={28}
          height={28}
          priority
          className="h-7 w-7"
        />
      ) : null}
      <span className="font-display text-xl font-semibold tracking-tight text-sniffy-ink">
        Sniffy
      </span>
    </span>
  );
}
