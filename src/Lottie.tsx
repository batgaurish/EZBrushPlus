import { useEffect, useRef } from "react";
import lottie from "lottie-web";

export default function Lottie({ src, loop = true, className }: { src: string; loop?: boolean; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anim = lottie.loadAnimation({ container: el.current!, path: src, renderer: "svg", loop, autoplay: true });
    return () => anim.destroy();
  }, [src, loop]);
  return <div ref={el} className={className} aria-hidden="true" />;
}
